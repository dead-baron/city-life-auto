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

const DISTRICT_NAMES = { beaches: [43, 44, 14, 10] };   // Gull Harbor, Coral Cay, Pelican Key, Sunset Beach

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
  Object.defineProperty(m, '_distStyle', { value: H.distStyle || [], enumerable: false, configurable: true });
  if (H.terrainAt && m.terrainCls && !m.terrainCls.at) Object.defineProperty(m.terrainCls, 'at', { value: (tx, ty) => H.terrainAt(m.terrainCls.cls, m.terrainCls.cw, tx, ty), enumerable: false });
  redwoodCreek(m, H);
  canyonOasis(m, H);
  canyonWash(m, H);
  lighthouseTidepools(m, H);
  campDressing(m, H);
  beachBonfire(m, H);
  desertCamp(m, H);
  summitTarn(m, H);
  heronMarsh(m, H);
  northshoreGardens(m, H);
  lakeviewPark(m, H);
  stadiumLido(m, H);
  oldMine(m, H);
  farmDressing(m, H);
  willowRiver(m, H);
  graniteCove(m, H);
  route9(m, H);
  pineLake(m, H);
  cedarCreek(m, H);
  wreckIsland(m, H);
  bluffsMaze(m, H);
  hotSprings(m, H);
  splashBay(m, H);
  driftwoodPoint(m, H);
  northPointCourts(m, H);
  westportPier(m, H);
  vineyard(m, H);
  orchard(m, H);
  hilltopTrack(m, H);
  balloonField(m, H);
  missionRuins(m, H);
  fernGorge(m, H);
  sentinelStones(m, H);
  marketSquare(m, H);
  boneyard(m, H);
  lavenderFields(m, H);
  waysideFinds(m, H);
  golfClub(m, H);
  driveTracks(m, H);
  roadside(m, H);
  coralRainforest(m, H);
}

// ---- Cedar Hills Golf Club (Cedar Hills, on the south island's west shore; original) ---------------------------
// The golf club's ground was a bare green with a blank block where the old painting's clubhouse stood. Now it is a
// three-hole course: striped fairways through longer rough, bright putting greens mown in a checker with a flag on
// each, sand bunkers round the greens, a pond beside the second fairway, tees with a bench, a
// concrete cart path between the holes and carts on it; the white clubhouse with a green roof and a veranda at the
// north-east corner by the road, its car park, a practice green and tables on the lawn; oaks, pines and cypresses
// between the holes. (m.golf: the ground bake draws the greens, tees and fairways.)
function golfClub(m, H) {
  const pt = (m.paintings || []).find((q) => q.key === 'golf');
  if (!pt) return;
  const PX = Math.round(pt.x / TILE), PY = Math.round(pt.y / TILE), PW = Math.round(pt.w / TILE), PH = Math.round(pt.h / TILE);
  if (PW < 50 || PH < 34) return;
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx), P = (dx, dy) => [(PX + dx) * TILE, (PY + dy) * TILE];
  const add = (t, dx, dy, r = 0, extra = null) => H.addProp(m, t, Math.round((PX + dx) * TILE), Math.round((PY + dy) * TILE), r, extra);
  // the old painting's solid block goes back to grass
  for (let ty = PY; ty < PY + PH; ty++) for (let tx = PX; tx < PX + PW; tx++) { const i = at(tx, ty); if (m.tiles[i] === T.WALL) m.tiles[i] = T.GRASS; }
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= pt.x && q.x < pt.x + pt.w && q.y >= pt.y && q.y < pt.y + pt.h) dropProp(m, i); });
  // the holes: [tee, fairway control points, green]
  const holes = [
    { tee: [38, 8.5], way: [[35, 8.6], [28, 9.4], [20, 9.8], [14, 9.6]], green: [10.5, 9.5] },
    { tee: [7.5, 16.5], way: [[10, 17.8], [16, 20.5], [22, 25.5], [27, 28.2]], green: [30.5, 29] },
    { tee: [37, 31.5], way: [[39, 29], [42, 25], [45, 21], [46.5, 19.5]], green: [47, 16] },
  ];
  const golf = { greens: [], tees: [], fairways: [] };
  holes.forEach((h, k) => {
    golf.greens.push({ x: P(...h.green)[0], y: P(...h.green)[1], r: 2.7 * TILE });
    golf.tees.push({ x: (PX + h.tee[0] - 1.2) * TILE, y: (PY + h.tee[1] - 0.8) * TILE, w: 2.4 * TILE, h: 1.6 * TILE });
    golf.fairways.push({ pts: spline(h.way.map((q) => P(...q)), 24), hw: 2.6 * TILE });
    add('golfflag', h.green[0] + 0.4, h.green[1] - 0.3, 3);
    add('pbench', h.tee[0], h.tee[1] + 1.6, 8, { a: Math.PI / 2 });
    void k;
  });
  // the practice green by the clubhouse, three flags on it
  golf.greens.push({ x: P(40, 15)[0], y: P(40, 15)[1], r: 2.2 * TILE });
  for (const [dx, dy] of [[-1, -0.6], [0.9, 0.2], [-0.2, 1.1]]) add('golfflag', 40 + dx, 15 + dy, 0);
  m.golf = golf;
  // the bunkers (sand) round the greens, the pond beside the second fairway
  const blob = (cx, cy, rx, ry, fn) => { for (let ty = Math.floor(cy - ry - 1); ty <= cy + ry + 1; ty++) for (let tx = Math.floor(cx - rx - 1); tx <= cx + rx + 1; tx++) { const dx = (tx + 0.5 - cx) / rx, dy = (ty + 0.5 - cy) / ry, a = Math.atan2(dy, dx), q = Math.hypot(dx, dy) / (1 + 0.12 * Math.sin(a * 3 + cx)); if (q <= 1) fn(at(tx, ty), q); } };
  for (const [dx, dy, rx, ry] of [[PX + 13.6, PY + 12.4, 1.8, 1.1], [PX + 7.6, PY + 6.8, 1.5, 1.0], [PX + 33.6, PY + 31.6, 2.0, 1.1], [PX + 27.4, PY + 26.2, 1.4, 1.0], [PX + 49.8, PY + 18.6, 1.6, 1.2], [PX + 44, PY + 13.2, 1.7, 1.0], [PX + 30, PY + 9.4, 1.6, 1.1]]) blob(dx, dy, rx, ry, (i) => { if (m.tiles[i] === T.GRASS) { m.tiles[i] = T.SAND; m.reserve[i] |= RES | 4; } });
  const POND = [PX + 21.5, PY + 18.5, 4.2, 2.4];
  blob(...POND, (i, q) => { m.tiles[i] = q < 0.5 ? T.DEEP : T.WATER; m.lake[i] = 1; m.reserve[i] |= RES; });
  // the cart path: a concrete ribbon from the clubhouse round the holes (pale concrete: plaza tiles)
  const cart = spline([P(43, 9.5), P(38, 11), P(26, 12.4), P(14, 13.2), P(9, 14.5), P(10, 21), P(18, 24.5), P(26, 31.5), P(33, 33.6), P(40, 33.2), P(44, 28), P(50, 23), P(51.5, 16), P(48.5, 11)], 12);
  for (const [x, y] of cart) { const i = at(x / TILE, y / TILE); if (m.tiles[i] === T.GRASS) m.tiles[i] = T.PLAZA; }
  for (const [k, a, v] of [[6, Math.PI, 0], [60, 1.2, 1], [118, -0.4, 2]]) if (cart[k]) { const [x, y] = cart[k]; H.addProp(m, 'golfcart', Math.round(x), Math.round(y - 4), 12, { a, v }); }
  // the clubhouse at the north-east corner, the veranda on its south side; its car park out to the road
  add('clubhouse', 44.5, 4.2, 0);
  for (let dx = -116; dx <= 116; dx += 24) for (const dy of [-50, -18, 14]) m.addSolidProp(Math.round((PX + 44.5) * TILE + dx), Math.round((PY + 4.2) * TILE + dy), 18);
  for (const [dx, dy, u] of [[39.5, 8.4, 'umbrella_g'], [42.5, 8.6, 'umbrella_r'], [46.5, 8.6, 'umbrella_g'], [49.5, 8.4, 'umbrella_r']]) { add('cafetable', dx, dy, 6); add(u, dx + 0.9, dy + 0.4, 4); }
  for (let ty = PY - 5; ty <= PY + 7; ty++) for (let tx = PX + PW - 3; tx <= PX + PW + 4; tx++) { const i = at(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) { m.tiles[i] = T.LOT; m.reserve[i] |= RES | 1; } }
  for (let k = 0; k < 3; k++) m.parking.push({ x: Math.round((PX + PW + 1.5) * TILE), y: Math.round((PY - 2 + k * 3) * TILE), a: Math.PI, drive: true });
  add('textsign', PW - 6.5, 9.6, 0, { text: 'CEDAR HILLS GOLF CLUB', z: 34, sx: 1, bg: '#1e4a32', fg: [240, 230, 190] });
  // the trees between the holes (never on a fairway, green, tee, bunker, the pond or the path)
  const clear = (x, y, r) => { for (const g of golf.greens) if (Math.hypot(x - g.x, y - g.y) < g.r + r) return false; for (const f of golf.fairways) if (nearest(f.pts, x, y)[0] < f.hw + r) return false; for (const t of golf.tees) if (x > t.x - r && x < t.x + t.w + r && y > t.y - r && y < t.y + t.h + r) return false; if (nearest(cart, x, y)[0] < r + 20) return false; if (Math.hypot((x / TILE - POND[0]) / (POND[2] + 2), (y / TILE - POND[1]) / (POND[3] + 2)) < 1) return false; const i = at(x / TILE, y / TILE); return m.tiles[i] === T.GRASS; };
  let n = 0;
  for (let ty = 1.5; ty < PH - 1; ty += 2.6) for (let tx = 1.5; tx < PW - 1; tx += 2.6) {
    const jx = tx + (hash2(Math.round(tx * 3), Math.round(ty * 3), 3301) - 0.5) * 1.6, jy = ty + (hash2(Math.round(tx * 3), Math.round(ty * 3), 3302) - 0.5) * 1.6, [x, y] = P(jx, jy);
    if (jx > PW - 16 && jy < 12) continue;   // (the clubhouse's corner stays open)
    if (hash2(Math.round(tx), Math.round(ty), 3303) > 0.55 || !clear(x, y, 52)) continue;
    const h = hash2(Math.round(tx), Math.round(ty), 3304), sp = h < 0.45 ? 'oak' : h < 0.7 ? 'pine' : h < 0.85 ? 'cypress' : 'maple';
    H.addProp(m, 'tree_a', Math.round(x), Math.round(y), 12, { sp, k: 1.3 + hash2(Math.round(tx), Math.round(ty), 3305) * 0.3 }); n++;
  }
  (m.landmarks ||= []).push({ name: 'Cedar Hills Golf Club', type: 'golf', x: pt.x, y: pt.y, w: pt.w, h: pt.h });
  m.natureSites.push({ kind: 'golf', name: 'Cedar Hills Golf Club', x: Math.round((PX + 44.5) * TILE), y: Math.round((PY + 9) * TILE), greens: golf.greens.length, pond: { x: POND[0] * TILE, y: POND[1] * TILE }, trees: n });
}

// ---- Tracks to the cottages in the wilds ------------------------------------------------------------------------
// A few homes out in the wilds (creekside cottages in the woods, the hills and the farmland) have a drive that runs
// off into the trees and stops short of any road. Each now gets a dirt track from the end of its drive to the
// nearest road, where it can get there over open ground, and a mailbox where it meets the road.
function driveTracks(m, H) {
  const at = (tx, ty) => ty * MAP_W + tx, N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const roadPts = [];
  for (const e of m.edges || []) if (e.lvl === 0 && e.kind !== 'hwy' && !e.bridge) for (let k = 1; k < e.pts.length; k++) { const a = e.pts[k - 1], b = e.pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 32)); for (let j = 0; j <= n; j++) roadPts.push([a.x + (b.x - a.x) * j / n, a.y + (b.y - a.y) * j / n]); }
  const openLand = (t) => t === T.GRASS || t === T.DIRT || t === T.SAND || t === T.LOT;
  for (const h of m.homes || []) {
    const g = h.garageDoor || h.garage;
    if (!g) continue;
    const sx = Math.floor(g.x / TILE), sy = Math.floor(g.y / TILE), drive = new Set(), q = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = at(sx + dx, sy + dy); if (m.tiles[i] === T.LOT && !drive.has(i)) { drive.add(i); q.push(i); } }
    let joined = false;
    while (q.length && drive.size < 300) {
      const i = q.pop(), x = i % MAP_W, y = Math.floor(i / MAP_W);
      for (const [dx, dy] of N4) { const j = at(x + dx, y + dy), t = m.tiles[j]; if (t === T.ROAD || t === T.BRIDGE || t === T.SIDEWALK) joined = true; else if (t === T.LOT && !drive.has(j)) { drive.add(j); q.push(j); } }
    }
    if (joined || drive.size < 6) continue;
    // the drive's far end, and whether a track already comes to it (the Hilltop Mansion's)
    let end = null, ed = -1;
    for (const i of drive) { const x = (i % MAP_W + 0.5) * TILE, y = (Math.floor(i / MAP_W) + 0.5) * TILE, d = Math.hypot(x - g.x, y - g.y); if (d > ed) { ed = d; end = [x, y]; } }
    if ((m.tracks || []).some((r) => r.pts.some(([x, y]) => Math.hypot(x - end[0], y - end[1]) < 3 * TILE))) continue;
    // the nearest road, reached over open ground
    let best = null, bd = 90 * TILE;
    for (const [x, y] of roadPts) { const d = Math.hypot(x - end[0], y - end[1]); if (d < bd) { bd = d; best = [x, y]; } }
    if (!best) continue;
    const len = Math.hypot(best[0] - end[0], best[1] - end[1]), ux = (best[0] - end[0]) / len, uy = (best[1] - end[1]) / len, bend = (hash2(sx, sy, 3401) - 0.5) * Math.min(160, len * 0.2);
    const pts = spline([end, [end[0] + (best[0] - end[0]) * 0.45 - uy * bend, end[1] + (best[1] - end[1]) * 0.45 + ux * bend], [best[0] - ux * 40, best[1] - uy * 40], best], 12);
    let ok = true;
    for (const [x, y] of pts) { const t = m.tiles[at(Math.floor(x / TILE), Math.floor(y / TILE))]; if (!openLand(t) && t !== T.ROAD && t !== T.SIDEWALK) { ok = false; break; } }
    if (!ok) continue;
    for (const [x, y] of pts) m.props.forEach((p, i) => { if (p && p.t !== 'painted' && Math.hypot(p.x - x, p.y - y) < 36) dropProp(m, i); });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    (m.tracks ||= []).push({ pts, hw: 26, bb: [x0 - 40, y0 - 40, x1 + 40, y1 + 40], home: h.id });
    for (const [x, y] of pts) reserveRound(m, x, y, 30);
    // the mailbox by the road, to one side of the track
    let mx = best[0] - ux * 70 - uy * 44, my = best[1] - uy * 70 + ux * 44;
    if (!openLand(m.tiles[at(Math.floor(mx / TILE), Math.floor(my / TILE))])) { mx = best[0] - ux * 70 + uy * 44; my = best[1] - uy * 70 - ux * 44; }
    if (openLand(m.tiles[at(Math.floor(mx / TILE), Math.floor(my / TILE))])) H.addProp(m, 'mailbox', Math.round(mx), Math.round(my), 0);
  }
}

// ---- The Hilltop Mansion's track (Dry Creek Desert) ------------------------------------------------------------
// The mansion on the rise east of the Farm Road had a drive that ran north into the open desert and stopped, and the
// Farm Road itself stops short in the sand: a dirt track now joins them, from the road's end across the desert to
// the top of the drive, with a mailbox and a name board at the road's end and the drive's gate posts at the top.
function hilltopTrack(m, H) {
  const h = (m.homes || []).find((q) => q.name === 'Hilltop Mansion'), fr = (m.edges || []).filter((e) => e.name === 'Farm Road' && e.lvl === 0);
  if (!h || !fr.length) return;
  let end = null;
  for (const e of fr) for (const q of [e.pts[0], e.pts[e.pts.length - 1]]) if (!end || q.y < end.y) end = q;
  const g = h.garageDoor || h.garage, gx = g.x; let gy = g.y;
  while (gy > g.y - 40 * TILE && m.tiles[at(gx, gy - TILE)] === T.LOT) gy -= TILE;
  if (m.tiles[at(gx, gy)] !== T.LOT || Math.hypot(gx - end.x, gy - end.y) > 100 * TILE) return;
  const top = [gx, Math.floor(gy / TILE) * TILE + 8], dx = top[0] - end.x;
  const pts = spline([[end.x, end.y - 20], [end.x + 30, end.y - 70], [end.x + dx * 0.3, end.y - 60 + (top[1] - end.y) * 0.2], [end.x + dx * 0.65, top[1] - 70], [top[0] - 90, top[1] - 34], [top[0], top[1] - 6]], 12);
  for (const [x, y] of pts) { const i = at(x, y); if (m.tiles[i] !== T.DIRT && m.tiles[i] !== T.GRASS && m.tiles[i] !== T.SAND && m.tiles[i] !== T.LOT && m.tiles[i] !== T.ROAD) return; }
  for (const [x, y] of pts) m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.hypot(q.x - x, q.y - y) < 40) dropProp(m, i); });
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  (m.tracks ||= []).push({ pts, hw: 28, bb: [x0 - 40, y0 - 40, x1 + 40, y1 + 40] });
  for (const [x, y] of pts) reserveRound(m, x, y, 34);
  H.addProp(m, 'mailbox', Math.round(end.x + 60), Math.round(end.y - 16), 0);
  H.addProp(m, 'textsign', Math.round(end.x - 64), Math.round(end.y - 30), 0, { text: 'HILLTOP', z: 26, sx: 1, bg: '#4a3a2a', fg: [236, 214, 170] });
  for (const sd of [-1, 1]) H.addProp(m, 'post', Math.round(top[0] + sd * 64), Math.round(top[1] + 10), 5, { h: 40 });
}

// ---- Wayside finds: small things to come across in the open country between places ---------------------------------
// The empty ground between the designed places gets a scatter of little scenes, each found by walking or riding off
// the road: a camp someone left (a tent, a dead fire, a log seat, a cooler), a picnic spot, a lookout bench with a
// trail map, a cairn on a hilltop, a lone standing stone, a woodcutter's clearing, a row of beehives, an old
// prospector's spot in the desert (a chest, a pickaxe, rocks). Off the roads, away from every other place.
function waysideFinds(m, H) {
  const at = (tx, ty) => ty * MAP_W + tx;
  const KINDS = {
    29: ['camp', 'woodcut', 'picnic', 'lookout', 'menhir'],   // Highland Woods
    40: ['camp', 'woodcut', 'picnic', 'lookout'],             // Cedar Hills
    33: ['cairn', 'lookout', 'menhir', 'camp', 'cairn'],      // Granite Peaks
    9: ['apiary', 'picnic', 'apiary'],                        // Dry Creek
    38: ['apiary', 'picnic'],                                 // Cedar Farms
    41: ['prospect', 'cairn', 'prospect'],                    // Dry Creek Desert
  };
  const hard = new Set([T.ROAD, T.BRIDGE, T.LOT, T.BUILDING, T.WALL, T.WATER, T.DEEP, T.SIDEWALK, T.PLAZA, T.DOCK, T.FIELD]);
  const placed = [];
  const far = (tx, ty) => placed.every(([x, y]) => Math.hypot(x - tx, y - ty) > 26) && (m.natureSites || []).every((q) => Math.hypot(q.x / TILE - tx, q.y / TILE - ty) > 22) && (m.countrySites || []).every((q) => Math.hypot((q.x + (q.w || 0) / 2) / TILE - tx, (q.y + (q.h || 0) / 2) / TILE - ty) > 16);
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  for (let gy = 10; gy < MAP_H - 10; gy += 18) for (let gx = 10; gx < MAP_W - 10; gx += 18) {
    const tx = gx + Math.floor(hash2(gx, gy, 4101) * 8) - 4, ty = gy + Math.floor(hash2(gx, gy, 4102) * 8) - 4, d = m.dist[at(tx, ty)], kinds = KINDS[d];
    if (!kinds || placed.length >= 48 || hash2(gx, gy, 4103) > 0.55 || placed.filter((q) => q[3] === d).length >= 8) continue;   // (at most 8 in a district)
    let ok = true;
    for (let dy = -7; dy <= 7 && ok; dy++) for (let dx = -7; dx <= 7; dx++) {
      const i = at(tx + dx, ty + dy), t = m.tiles[i];
      if (hard.has(t)) { ok = false; break; }
      if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3 && ((m.reserve[i] & RES) || m.dist[i] !== d || !(t === T.GRASS || t === T.DIRT || t === T.SAND))) { ok = false; break; }
    }
    if (!ok || !far(tx, ty)) continue;
    const kind = kinds[Math.floor(hash2(gx, gy, 4104) * kinds.length)], h = (k) => hash2(gx + k, gy, 4105 + k);
    m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.abs(q.x / TILE - tx - 0.5) < 3.2 && Math.abs(q.y / TILE - ty - 0.5) < 3.2) dropProp(m, i); });
    for (let dy = -3; dy <= 7; dy++) for (let dx = -3; dx <= 3; dx++) { const i = at(tx + dx, ty + dy); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) m.reserve[i] |= RES; }   // (and nothing tall just south of it: in this view it would stand in front)
    m.props.forEach((q, i) => { if (q && q.t !== 'painted' && /^tree/.test(q.t) && Math.abs(q.x / TILE - tx - 0.5) < 3.5 && q.y / TILE - ty > 0 && q.y / TILE - ty < 8) dropProp(m, i); });
    const X = tx + 0.5, Y = ty + 0.5;
    switch (kind) {
      case 'camp': add('tent', X - 1.2, Y - 1, 12, { v: Math.floor(h(1) * 3) }); add('campfire', X + 0.8, Y + 0.6, 0, { lit: false }); add('log', X + 0.8, Y + 2, 8, { len: 70, a: 0.1 }); add('cooler', X - 1.4, Y + 1.2, 0, { v: Math.floor(h(2) * 3) }); add('chair', X + 2.2, Y + 0.4, 0, { a: Math.PI, v: Math.floor(h(3) * 4) }); break;
      case 'picnic': add('picnic', X, Y, 10); add('blanket', X + 2, Y + 1, 0, { v: Math.floor(h(1) * 3) }); add('cooler', X + 2.8, Y + 0.4, 0, { v: Math.floor(h(2) * 3) }); add('trashcan', X - 2, Y - 0.6, 6); break;
      case 'lookout': add('pbench', X, Y, 8, { a: Math.PI / 2 }); add('mapboard', X + 2, Y - 0.4, 10); add('fingerpost', X - 2, Y + 0.2, 4); break;
      case 'cairn': add('boulder', X, Y, 14, { s: 30 }); add('boulder', X + 0.1, Y - 0.15, 0, { s: 20, z: 18 }); add('boulder', X - 0.05, Y - 0.3, 0, { s: 12, z: 30 }); for (let k = 0; k < 4; k++) add('boulder', X + (h(k + 4) - 0.5) * 4, Y + (h(k + 8) - 0.5) * 4, 0, { s: 8 + Math.round(h(k + 12) * 8) }); break;
      case 'menhir': add('mstone', X, Y, 12, { w: 22, d: 12, h: 60 + Math.round(h(1) * 20), v: Math.floor(h(2) * 8), lean: (h(3) - 0.5) * 0.2 }); add('boulder', X + 1.6, Y + 1, 0, { s: 14, moss: 1 }); break;
      case 'woodcut': add('woodpile', X, Y - 0.6, 8); add('log', X - 1.2, Y + 1.2, 10, { len: 110, a: 0.3, moss: 0 }); add('log', X + 1.6, Y + 0.8, 8, { len: 70, a: -0.5 }); add('boulder', X + 2, Y - 1.6, 0, { s: 12 }); break;
      case 'apiary': for (let k = 0; k < 4; k++) add('beehive', X - 2.4 + k * 1.6, Y, 6, { v: k % 3 }); add('pbench', X, Y + 2, 8, { a: -Math.PI / 2 }); break;
      case 'prospect': add('chest', X, Y, 10); add('pickaxe', X + 0.9, Y + 0.3, 0); for (let k = 0; k < 3; k++) add('boulder', X + (h(k + 4) - 0.5) * 5, Y + (h(k + 8) - 0.5) * 4, 14, { s: 22 + Math.round(h(k + 12) * 18) }); add('tree_a', X + 2.4, Y - 1.8, 8, { sp: 'saguaroMid', k: 1.1 }); break;
    }
    placed.push([tx, ty, kind, d]);
  }
  m.wayside = placed.map(([x, y, kind]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, kind }));
}

// ---- Cedar Point Lavender (Cedar Farms, on the coast below the Cedar Isle Loop; original) ---------------------------
// Rows of lavender sweeping across the open coastal ground south of the highway, purple stripes on pale soil with
// green between; a few olive trees and a white bench at the top, beehives along the east side, a wooden cart of
// cut bunches and the farm's sign by the path in from the beach.
function lavenderFields(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const X0 = 724, X1 = 750, Y0 = 1097, Y1 = 1123;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !(m.reserve[i] & RES) && m.dist[i] === 38;
  let bad = 0; for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) if (!open(at(tx, ty))) bad++;
  if (bad > 12) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= X0 * TILE && q.x < (X1 + 1) * TILE && q.y >= Y0 * TILE && q.y < (Y1 + 1) * TILE) dropProp(m, i); });
  // the rows: a strip of soil under each (every other row of tiles), green between
  let n = 0;
  for (let ty = Y0 + 1; ty <= Y1 - 1; ty++) for (let tx = X0; tx <= X1; tx++) {
    const i = at(tx, ty);
    if (!open(i)) continue;
    m.reserve[i] |= RES;
    if ((ty - Y0) % 2 === 1) m.tiles[i] = T.DIRT; else { m.tiles[i] = T.GRASS; m.reserve[i] |= 128; }
  }
  for (let ty = Y0 + 1.5; ty <= Y1 - 1; ty += 2) for (let tx = X0 + 0.6; tx <= X1 + 0.4; tx += 0.95) {
    if (!open(at(tx, ty)) && m.tiles[at(tx, ty)] !== T.DIRT) continue;
    add('shrub_a', tx + (hash2(Math.round(tx * 4), Math.round(ty), 4001) - 0.5) * 0.2, ty, 0, { sp: 'lavender', k: 1.05 + hash2(Math.round(tx * 4), Math.round(ty), 4002) * 0.2 }); n++;
  }
  // the top: olive trees and a bench looking down the rows; beehives along the east side; the cart and the sign
  for (const [dx, k] of [[2, 1.4], [12, 1.3], [22, 1.45]]) add('tree_a', X0 + dx, Y0 - 1.2, 12, { sp: 'olive', k });
  add('pbench', X0 + 7, Y0 - 0.6, 8, { a: Math.PI / 2 });
  for (let j = 0; j < 4; j++) add('beehive', X1 + 1.6, Y0 + 4 + j * 2.6, 6, { v: j % 3 });
  add('fruitcrate', X0 + 3.4, Y1 + 0.9, 0); add('fruitcrate', X0 + 4.1, Y1 + 1.1, 0); add('wheelbarrow', X0 + 6, Y1 + 1, 0);
  add('textsign', X0 + 1, Y1 + 1.6, 0, { text: 'CEDAR POINT LAVENDER', z: 26, sx: 1, bg: '#5a3a8a', fg: [250, 240, 210] });
  (m.landmarks ||= []).push({ name: 'Cedar Point Lavender', type: 'lavender', x: X0 * TILE, y: Y0 * TILE, w: (X1 - X0 + 1) * TILE, h: (Y1 - Y0 + 1) * TILE });
  m.natureSites.push({ kind: 'lavender', name: 'Cedar Point Lavender', x: Math.round((X0 + X1) / 2 * TILE), y: Math.round((Y0 + Y1) / 2 * TILE), plants: n });
}

// ---- The Dry Creek boneyard (east of the airstrip's runway; original) ---------------------------------------------
// Old airliners parked for good on the desert east of the runway, in two herringbone rows behind a chain-link fence:
// their liveries sun-faded, white covers on the cockpit windows, red covers on the engines, an engine missing here and
// there; a gate from the airstrip's side with the yard's sign, oil drums about.
function boneyard(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const X0 = 1248, X1 = 1279, Y0 = 632, Y1 = 704;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !(m.reserve[i] & RES) && (m.dist[i] === 42 || m.dist[i] === 41);
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1 - 4; tx++) if (!open(at(tx, ty))) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= X0 * TILE && q.x < (X1 + 1) * TILE && q.y >= Y0 * TILE && q.y < (Y1 + 1) * TILE) dropProp(m, i); });
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) { const i = at(tx, ty); if (open(i)) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
  // the planes: two rows, nose out at a slant (herringbone), every one a little different
  let n = 0;
  for (let r = 0; r < 6; r++) for (const [cx, a] of [[X0 + 8, -0.55], [X0 + 22.5, Math.PI + 0.55]]) {
    const cy = Y0 + 6.5 + r * 11.5, ux = Math.cos(a), uy = Math.sin(a);
    add('storedplane', cx, cy, 0, { a, c: (r * 2 + (cx > X0 + 10 ? 1 : 0)) % 5, v: r * 2 + (cx > X0 + 10 ? 1 : 0) });
    for (let d = -130; d <= 130; d += 26) m.addSolidProp(Math.round(cx * TILE + ux * d), Math.round(cy * TILE + uy * d), 20);   // (the fuselage; you walk under the wings)
    n++;
  }
  // the fence round it, the gate on the runway side with the sign
  const fence = [[X0, Y0, X1, Y0], [X1, Y0, X1, Y1], [X0, Y1, X1, Y1], [X0, Y0, X0, Y0 + 32], [X0, Y0 + 38, X0, Y1]];
  for (const [ax, ay, bx, by] of fence) {
    add('chainfence', ax, ay, 0, { tx: (bx - ax) * TILE, ty: (by - ay) * TILE });
    const L = Math.hypot(bx - ax, by - ay) * TILE; for (let d = 0; d <= L; d += 16) m.addSolidProp(Math.round(ax * TILE + (bx - ax) / Math.hypot(bx - ax, by - ay) * d), Math.round(ay * TILE + (by - ay) / Math.hypot(bx - ax, by - ay) * d), 6);
  }
  add('textsign', X0 - 1.6, Y0 + 39.6, 0, { text: 'AIRCRAFT STORAGE', z: 30, sx: 1, bg: '#3a3e44', fg: [240, 230, 200] });
  for (const [dx, dy] of [[3, 3], [28, 70], [14, 40]]) add('drum', X0 + dx, Y0 + dy, 9);
  (m.landmarks ||= []).push({ name: 'Dry Creek Boneyard', type: 'boneyard', x: X0 * TILE, y: Y0 * TILE, w: (X1 - X0 + 1) * TILE, h: (Y1 - Y0 + 1) * TILE });
  m.natureSites.push({ kind: 'boneyard', name: 'Dry Creek Boneyard', x: Math.round((X0 + X1) / 2 * TILE), y: Math.round((Y0 + Y1) / 2 * TILE), planes: n, gate: { x: X0 * TILE, y: (Y0 + 35) * TILE } });
}

// ---- The Old Town market (Old Town's big cobbled square; original) -----------------------------------------------
// The empty cobbled square round the fountain becomes a market: two rows of stalls under striped awnings facing
// each other across the square (fruit, greens, flowers, bread), crates of produce, string lights zig-zagging
// over the aisle between the rows on posts, cafe tables under umbrellas at the south end, benches by the fountain.
// (Props only: the square, its lamps, its fountain and its trees stay as they are.)
function marketSquare(m, H) {
  const at = (tx, ty) => ty * MAP_W + tx;
  // the square: the biggest run of plaza in Old Town round (1033, 397)
  let x0 = 1033, x1 = 1033, y0 = 397, y1 = 397;
  const pl = (tx, ty) => m.tiles[at(tx, ty)] === T.PLAZA && m.dist[at(tx, ty)] === 18;
  if (!pl(1033, 397)) return;
  while (pl(x0 - 1, 397)) x0--; while (pl(x1 + 1, 397)) x1++; while (pl(1033, y0 - 1)) y0--; while (pl(1033, y1 + 1)) y1++;
  if (x1 - x0 < 14 || y1 - y0 < 16) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  const busy = (tx, ty, r) => m.props.some((q) => q && q.t !== 'painted' && Math.hypot(q.x / TILE - tx, q.y / TILE - ty) < r);
  const cxF = (x0 + x1 + 1) / 2, rows = [y0 + 3.4, y1 - 5.4];
  let n = 0, k = 0;
  // two rows of stalls across the square, facing south (the fountain between the rows), crates in front
  const MOVABLE = new Set(['bench_a', 'bench_b', 'bench_m', 'trashcan', 'planter_g', 'planter_sq', 'planter_fl', 'potted', 'news_a', 'news_b', 'news_c', 'bags', 'mosaic']);
  for (const ry of rows) for (const dx of [-5.9, -1.95, 1.95, 5.9]) {
    const tx = cxF + dx;
    m.props.forEach((q, i) => { if (q && MOVABLE.has(q.t) && Math.abs(q.x / TILE - tx) < 1.3 && Math.abs(q.y / TILE - ry) < 1.2) dropProp(m, i); });   // (the square's loose benches and bins make way)
    if (busy(tx, ry, 1.15) || (m.pois || []).some((p) => Math.hypot(p.x / TILE - tx, p.y / TILE - ry) < 2.5)) continue;   // (round the square's trees and lamps, clear of anything you use)
    add('mstall', tx, ry, 14, { v: k, c: k + (ry > rows[0] ? 1 : 0), a: 0 }); n++; k++;
    if (k % 2) add('fruitcrate', tx + 1.2, ry + 1.4, 0);
  }
  // the string lights over each row, on posts at the square's edges
  for (const ry of rows) {
    const ya = ry - 1.2;
    add('post', x0 + 0.8, ya, 5, { h: 52 }); add('post', x1 + 0.2, ya, 5, { h: 52 });
    add('festoon', x0 + 0.8, ya, 0, { tx: Math.round((x1 - x0 - 0.6) / 2 * TILE), ty: 0, h: 50 });
    add('festoon', (x0 + x1 + 1) / 2, ya, 0, { tx: Math.round((x1 - x0 - 0.6) / 2 * TILE), ty: 0, h: 50 });
  }
  // cafe tables at the south end, benches round the fountain
  for (const dx of [-4.5, -1.5, 1.5, 4.5]) { const tx = cxF + dx, ty = y1 - 1.6; if (!busy(tx, ty, 1)) { add('cafetable', tx, ty, 6); add(dx < 0 ? 'umbrella_r' : 'umbrella_g', tx + 0.6, ty + 0.3, 4); } }
  for (const [dx, dy, a] of [[-2.6, 0, 0], [2.6, 0, Math.PI]]) { const tx = cxF + dx, ty = (y0 + y1) / 2 + dy; if (!busy(tx, ty, 1.2)) add('pbench', tx, ty, 8, { a }); }
  (m.landmarks ||= []).push({ name: 'Old Town Market', type: 'market', x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE });
  m.natureSites.push({ kind: 'market', name: 'Old Town Market', x: Math.round(cxF * TILE), y: Math.round((y0 + y1) / 2 * TILE), stalls: n, rect: { x0, y0, x1, y1 } });
}

// ---- The Sentinel Stones (Granite Peaks, the headland north of the observatory; original) ------------------------
// A ring of standing stones on the grassy headland over the north sea: ten weathered megaliths round a flat altar
// stone, one of them fallen, two more out on the point; a sea arch in the surf off the point (boats can go through
// it); heather and paintbrush round them, and a worn path up from the observatory road.
function sentinelStones(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const CX = 744, CY = 31;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !(m.reserve[i] & RES) && m.dist[i] === 33;
  for (let ty = CY - 4; ty <= CY + 4; ty++) for (let tx = CX - 5; tx <= CX + 5; tx++) if (!open(at(tx, ty))) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.hypot(q.x / TILE - CX, q.y / TILE - CY + 3) < 9) dropProp(m, i); });
  for (let ty = CY - 10; ty <= CY + 6; ty++) for (let tx = CX - 7; tx <= CX + 7; tx++) { const i = at(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) m.reserve[i] |= RES; }
  // the ring: ten stones, the third one fallen
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2 + 0.2, r = 3.6 + hash2(k, 1, 3901) * 0.3, x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r * 0.9;
    if (k === 3) { add('mstone', x + 0.5, y + 0.2, 10, { w: 46, d: 16, h: 10, v: k, a: a + 1.2 }); continue; }
    add('mstone', x, y, 11, { w: 20 + Math.round(hash2(k, 2, 3901) * 8), d: 11 + Math.round(hash2(k, 3, 3901) * 4), h: 46 + Math.round(hash2(k, 4, 3901) * 20), v: k, lean: (hash2(k, 5, 3901) - 0.5) * 0.16, a: a + Math.PI / 2 });
  }
  add('mstone', CX, CY + 0.2, 16, { w: 48, d: 28, h: 11, v: 9 });   // (the altar)
  // two more out on the point, the tallest
  for (const [dx, dy, h, v] of [[-1.2, -7.4, 62, 11], [1.6, -8.6, 54, 12]]) if (m.tiles[at(CX + dx, CY + dy)] === T.GRASS) add('mstone', CX + dx, CY + dy, 12, { w: 26, d: 13, h: h + 8, v, lean: dx * 0.02 });
  // the sea arch off the point: you can take a boat through it (only its legs are solid)
  for (const [dx, dy] of [[-2, -16.5], [-3, -18], [1, -17.5]]) {
    const ax = CX + dx, ay = CY + dy, ok = [-2.5, 0, 2.5].every((o) => { const t = m.tiles[at(ax + o, ay)]; return t === T.WATER || t === T.DEEP; });
    if (!ok) continue;
    add('seaarch', ax, ay, 0, { w: 150, d: 56, h: 96 });
    for (const sd of [-1, 1]) for (const oy of [-10, 10]) m.addSolidProp(Math.round(ax * TILE + sd * 56), Math.round(ay * TILE + oy), 16);
    add('gull', ax + 1.6, ay - 0.2, 0, { a: 2.2, z: 98 });
    break;
  }
  // heather and paintbrush round the stones
  for (let j = 0; j < 30; j++) { const a = hash2(j, 1, 3902) * Math.PI * 2, r = 5 + hash2(j, 2, 3902) * 3, x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r * 0.8; if (m.tiles[at(x, y)] === T.GRASS) add('shrub_a', x, y, 0, { sp: j % 3 === 1 ? 'paintbrush' : 'heather', k: 1 }); }
  // the worn path up from the observatory road to the ring
  const road = (m.edges || []).filter((e) => e.lvl === 0 && e.kind !== 'hwy').map((e) => e.pts).flat().reduce((b, q) => { const d = Math.hypot(q.x / TILE - CX, q.y / TILE - CY - 20); return !b || d < b.d ? { x: q.x, y: q.y, d } : b; }, null);
  if (road && road.d < 40) trail(m, [[road.x, road.y - 40], [(CX + 3) * TILE, (CY + 14) * TILE], [(CX + 1) * TILE, (CY + 5.2) * TILE]]);
  (m.landmarks ||= []).push({ name: 'The Sentinel Stones', type: 'stones', x: (CX - 5) * TILE, y: (CY - 8) * TILE, w: 10 * TILE, h: 13 * TILE });
  m.natureSites.push({ kind: 'stones', name: 'The Sentinel Stones', x: CX * TILE, y: CY * TILE, ring: 10 });
}

// ---- Fern Gorge (Highland Woods, off the Ridge Track; concepts NK1-B, NK1-N, NK1-A) ------------------------------
// A trailhead on the Ridge Track: a gravel pull-off with a rail fence, the trail map board, a finger post, a bench
// and a bin. The trail runs east through the ferns to a little gorge where a spring pool spills over a mossy granite
// ledge in a falls (facing you, south) into a lower pool of lily pads; the outlet creek runs on over stepping
// stones to a reedy pond. Mossy boulders, a fallen log, firs and maples round the pools, a bench at the falls.
function fernGorge(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const track = (m.edges || []).find((e) => e.name === 'Ridge Track' && e.lvl === 0);
  if (!track) return;
  const UP = [309, 171.6], LOW = [308.5, 180], POND = [300.5, 193], LEDGE = 174.4;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !(m.reserve[i] & RES) && m.dist[i] === 29;
  for (let ty = 164; ty <= 200; ty++) for (let tx = 296; tx <= 318; tx++) if (!open(at(tx, ty))) return;
  // the trailhead: the point on the track nearest the gorge's west side
  let th = null, bd = 1e9;
  for (let k = 1; k < track.pts.length; k++) {
    const a = track.pts[k - 1], b = track.pts[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, X = 298 * TILE, Y = 175 * TILE;
    const t = Math.max(0, Math.min(1, ((X - a.x) * dx + (Y - a.y) * dy) / l2)), q = { x: a.x + dx * t, y: a.y + dy * t }, d = Math.hypot(q.x - X, q.y - Y) / TILE;
    if (d < bd) { bd = d; th = q; }
  }
  if (!th || bd > 24) return;
  { let ok = true; for (let ty = Math.floor(th.y / TILE) + 1; ty <= th.y / TILE + 4; ty++) for (let tx = Math.floor(th.x / TILE) - 3; tx <= th.x / TILE + 5; tx++) { const t = m.tiles[at(tx, ty)]; if (t !== T.GRASS && t !== T.DIRT) ok = false; } if (!ok) return; }   // (open ground for the pull-off)
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= 294 * TILE && q.x < 320 * TILE && q.y >= 162 * TILE && q.y < 202 * TILE) dropProp(m, i); });
  for (let ty = 162; ty <= 201; ty++) for (let tx = 294; tx <= 319; tx++) { const i = at(tx, ty); if (open(i)) m.reserve[i] |= RES; }
  // the water: the spring pool above the ledge, the lily pool below, the outlet creek, the reedy pond
  const wet = new Set();
  const blob = (cx, cy, rx, ry, deep) => { for (let ty = Math.floor(cy - ry - 1); ty <= cy + ry + 1; ty++) for (let tx = Math.floor(cx - rx - 1); tx <= cx + rx + 1; tx++) { const dx = (tx + 0.5 - cx) / rx, dy = (ty + 0.5 - cy) / ry, a = Math.atan2(dy, dx), q = Math.hypot(dx, dy) / (1 + 0.1 * Math.sin(a * 3 + cx)); if (q > 1) continue; const i = at(tx, ty); m.tiles[i] = q < deep ? T.DEEP : T.WATER; m.lake[i] = 1; m.reserve[i] |= RES; wet.add(i); } };
  blob(UP[0], UP[1], 3.2, 2.2, 0.4); blob(LOW[0], LOW[1], 4.4, 3.0, 0.45); blob(POND[0], POND[1], 4.6, 3.2, 0.5);
  const creek = spline([[LOW[0] - 1.5, LOW[1] + 2.4], [306, 185.5], [303.5, 188.5], [POND[0] + 1.6, POND[1] - 2.4]].map(([x, y]) => [x * TILE, y * TILE]), 10);
  for (const [x, y] of creek) for (let ty = Math.floor(y / TILE - 1); ty <= y / TILE + 1; ty++) for (let tx = Math.floor(x / TILE - 1); tx <= x / TILE + 1; tx++) { if (Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > 22) continue; const i = at(tx, ty); if (!wet.has(i)) { m.tiles[i] = T.WATER; m.lake[i] = 1; m.reserve[i] |= RES; wet.add(i); } }
  if (m.distRiver) for (const i of wet) { m.distRiver[i] = 0; const tx = i % MAP_W, ty = Math.floor(i / MAP_W); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = (ty + dy) * MAP_W + tx + dx; if (wet.has(j)) continue; const d = Math.round(Math.hypot(dx, dy) * 4); if (!m.distRiver[j] || m.distRiver[j] > d) m.distRiver[j] = d; } }
  // the ledge between the pools: a mossy granite band (solid), the falls over it, mist
  for (let tx = UP[0] - 5; tx <= UP[0] + 5; tx++) { const i = at(tx, LEDGE); if (!wet.has(i)) { m.tiles[i] = T.WALL; m.reserve[i] |= RES; } }
  add('outcrop', UP[0], LEDGE + 0.4, 0, { w: 11 * TILE, d: 1.6 * TILE, h: 34, style: 'granite', s: 5 });
  add('fallsmall', UP[0] + 0.2, LEDGE + 1, 0, { w: 46, h: 34 });
  add('steam', LOW[0], LOW[1] - 1.2, 0, { w: 70, h: 34, s: 2 });
  for (let tx = UP[0] - 4.5; tx <= UP[0] + 4.5; tx += 1.5) if (Math.abs(tx - UP[0]) > 1) m.addSolidProp(Math.round(tx * TILE), Math.round(LEDGE * TILE), 14);
  // lily pads in the lower pool, reeds round the pond, stepping stones across the creek, mossy boulders, a log
  for (let j = 0; j < 4; j++) add('lily', LOW[0] - 2.4 + j * 1.6, LOW[1] + 0.6 + (j % 2) * 0.8, 0, { v: j });
  for (let j = 0; j < 3; j++) add('lily', POND[0] - 2 + j * 1.8, POND[1] + 0.8, 0, { v: (j + 2) % 4 });
  const sm = creek[Math.floor(creek.length * 0.55)], sn = creek[Math.floor(creek.length * 0.55) + 1], ca = Math.atan2(sn[1] - sm[1], sn[0] - sm[0]), bx = -Math.sin(ca), by = Math.cos(ca);
  for (const k of [-1, 0, 1]) { const x = sm[0] + bx * k * 18, y = sm[1] + by * k * 18, i = at(x / TILE, y / TILE); m.tiles[i] = T.SAND; m.reserve[i] |= RES; wet.delete(i); H.addProp(m, 'boulder', Math.round(x), Math.round(y), 0, { s: 14, moss: 1 }); }
  for (const [dx, dy, r] of [[-4.6, -1.2, 22], [5, -1, 20], [-5.4, 2.4, 18], [5.6, 3.2, 24], [-3.6, 4.2, 14]]) add('boulder', LOW[0] + dx, LOW[1] + dy, r, { s: r * 2, moss: 1 });
  add('log', LOW[0] + 3.4, LOW[1] + 5.2, 10, { a: 0.4, len: 110, moss: 1 });
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, x = POND[0] + Math.cos(a) * 5.4, y = POND[1] + Math.sin(a) * 3.8; if (!wet.has(at(x, y))) add('shrub_a', x, y, 0, { sp: k % 3 ? 'reeds' : 'cattails', k: 1 }); }
  // the trailhead: a gravel pull-off beside the track, a rail fence, the board, a finger post, a bench and a bin
  const tx0 = th.x / TILE, ty0 = th.y / TILE + 2.6;
  for (let ty = Math.floor(ty0 - 1); ty <= ty0 + 1; ty++) for (let tx = Math.floor(tx0 - 2); tx <= tx0 + 2; tx++) { const i = at(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { m.tiles[i] = T.LOT; m.reserve[i] |= RES | 1; } }
  m.parking.push({ x: Math.round(tx0 * TILE), y: Math.round(ty0 * TILE), a: 0, drive: true });
  add('mapboard', tx0 + 3.2, ty0 - 0.6, 10); add('fingerpost', tx0 + 3.6, ty0 + 1.4, 4);
  add('pbench', tx0 - 1.2, ty0 + 2, 8, { a: Math.PI / 2 }); add('trashcan', tx0 + 1.6, ty0 + 2, 6);
  add('creekrail', tx0, ty0 + 1.9, 0, { len: 150, a: 0 });
  // the trail: from the pull-off east through the ferns to the lily pool's west side, round to the falls
  const tr = trail(m, [[(tx0 + 3) * TILE, (ty0 + 1) * TILE], [299 * TILE, 172 * TILE], [302.5 * TILE, 177.5 * TILE], [303.6 * TILE, 182.5 * TILE]]);
  for (const [x, y] of tr) m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.hypot(q.x - x, q.y - y) < 30) dropProp(m, i); });
  add('pbench', 303.2, 177.2, 8, { a: 0 });
  // firs and maples round the gorge, ferns thick on the banks
  for (const [dx, dy, sp] of [[-7, -5, 'mtnFir'], [7.5, -6, 'mapleAutumn'], [9, 2, 'mtnFir'], [-8, 6, 'maple'], [8, 9, 'mtnFir'], [-3, 13, 'maple'], [10, 14, 'mtnFir'], [-9, -12, 'mtnFir']]) { const x = LOW[0] + dx, y = LOW[1] + dy; if (!wet.has(at(x, y)) && m.tiles[at(x, y)] === T.GRASS) add('tree_a', x, y, 12, { sp, k: 1.35 }); }
  for (let j = 0; j < 26; j++) { const x = LOW[0] - 8 + hash2(j, 1, 3801) * 16, y = UP[1] - 3 + hash2(j, 2, 3801) * 26, i = at(x, y); if (!wet.has(i) && m.tiles[i] === T.GRASS && !tr.some(([px, py]) => Math.hypot(px - x * TILE, py - y * TILE) < 40)) add('shrub_a', x, y, 0, { sp: j % 4 ? 'fern' : 'salal', k: 1 }); }
  (m.landmarks ||= []).push({ name: 'Fern Gorge', type: 'gorge', x: 296 * TILE, y: 164 * TILE, w: 22 * TILE, h: 34 * TILE });
  m.natureSites.push({ kind: 'gorge', name: 'Fern Gorge', x: Math.round(LOW[0] * TILE), y: Math.round(LOW[1] * TILE), trailhead: { x: Math.round(tx0 * TILE), y: Math.round(ty0 * TILE) }, falls: { x: Math.round(UP[0] * TILE), y: Math.round(LEDGE * TILE) }, pond: { x: Math.round(POND[0] * TILE), y: Math.round(POND[1] * TILE) } });
}

// ---- The old mission (Dry Creek Desert, east of the vineyard; original) --------------------------------------------
// The roofless ruin of an old adobe mission church stands on the open desert beside the vineyard (whose first vines,
// the story goes, came from its garden): crumbling plaster walls, the great arched doorway under the bell gable with
// two bells still hanging, the front's west corner fallen, a breach in the west wall you can climb through, the
// cloister's arcade with two arches down, rubble everywhere; saguaros, prickly pear and boulders round it.
function missionRuins(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const CX = 1190, CY = 405;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !(m.reserve[i] & RES) && (m.dist[i] === 9 || m.dist[i] === 41);
  for (let ty = CY - 6; ty <= CY + 7; ty++) for (let tx = CX - 6; tx <= CX + 6; tx++) if (!open(at(tx, ty))) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.abs(q.x / TILE - CX) < 7 && Math.abs(q.y / TILE - CY) < 7.5) dropProp(m, i); });
  for (let ty = CY - 6; ty <= CY + 7; ty++) for (let tx = CX - 6; tx <= CX + 6; tx++) m.reserve[at(tx, ty)] |= RES;
  const X = CX * TILE, Y = CY * TILE, x0 = X - 118, y0 = Y - 98;
  add('mission', CX, CY, 0);
  // the walls are solid (model coordinates: the nave x 24..124, y 40..186; the doorway at x 58..90; the breach y 96..122)
  const solid = (x, y) => m.addSolidProp(Math.round(x0 + x), Math.round(y0 + y), 7);
  for (let y = 44; y <= 182; y += 12) { if (y < 94 || y > 124) solid(29, y); solid(119, y); }
  for (let x = 28; x <= 120; x += 12) { solid(x, 45); if (Math.abs(x - 74) > 18) solid(x, 181); }
  for (let k = 0; k < 5; k++) solid(164, 56 + k * 26);
  for (let x = 128; x <= 164; x += 12) solid(x, 52);
  // round it: saguaros, prickly pear and sage, boulders
  for (const [dx, dy, sp] of [[-7.5, -4, 'saguaroBig'], [7.8, -5.5, 'saguaroMid'], [6.2, 5.6, 'saguaroBig'], [-8, 4.4, 'saguaroMid']]) add('tree_a', CX + dx, CY + dy, 8, { sp, k: 1.1 });
  for (const [dx, dy, sp] of [[-5.5, 5.8, 'pear'], [4, 6.4, 'pear'], [-6.6, -1, 'sage'], [7, 1.5, 'agave'], [2.5, -6.2, 'ocotillo'], [-3, -6.4, 'barrel']]) add('shrub_a', CX + dx, CY + dy, 0, { sp, k: 1 });
  for (const [dx, dy, sz] of [[5.4, -2.8, 30], [-7.2, 1.6, 24], [3.2, 7, 20]]) add('boulder', CX + dx, CY + dy, Math.round(sz * 0.5), { s: sz });
  (m.landmarks ||= []).push({ name: 'Old Mission Ruins', type: 'mission', x: (CX - 4) * TILE, y: (CY - 3) * TILE, w: 8 * TILE, h: 6 * TILE });
  m.natureSites.push({ kind: 'mission', name: 'Old Mission Ruins', x: X, y: Y, door: { x: Math.round(x0 + 74), y: Math.round(y0 + 192) }, breach: { x: Math.round(x0 + 29), y: Math.round(y0 + 109) } });
}

// ---- The balloon field (Dry Creek, east of the Farm Road; original) ---------------------------------------------
// A mown launch field out on the flat ground below the Hilltop Mansion's track: two hot-air balloons standing on
// their baskets with their burners lit, a third already aloft over the field, one laid out on the grass in front of
// its inflation fan, a windsock, and a sign for the rides at the track.
function balloonField(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const X0 = 1150, X1 = 1178, Y0 = 463, Y1 = 486;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !(m.reserve[i] & RES) && (m.dist[i] === 9 || m.dist[i] === 41);
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) if (!open(at(tx, ty))) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= X0 * TILE && q.x < (X1 + 1) * TILE && q.y >= Y0 * TILE && q.y < (Y1 + 1) * TILE) dropProp(m, i); });
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) { const d = Math.hypot((tx - (X0 + X1) / 2) / ((X1 - X0) / 2), (ty - (Y0 + Y1) / 2) / ((Y1 - Y0) / 2)); const i = at(tx, ty); m.reserve[i] |= RES; if (d < 1 - hash2(tx, ty, 3701) * 0.12) m.tiles[i] = T.GRASS; }
  add('balloon', X0 + 7, Y0 + 10, 26, { v: 0 });
  add('balloon', X0 + 19, Y0 + 14, 26, { v: 1 });
  add('balloon', X0 + 14, Y0 + 2, 0, { v: 2, up: 230 });
  add('balloonlaid', X0 + 11, Y0 + 20, 0, { v: 3, a: 0 });
  add('fan', X0 + 6.3, Y0 + 20, 8, { a: 0 });
  add('windsock', X1 - 2, Y0 + 2, 4);
  add('textsign', X0 + 2.5, Y0 - 0.2, 0, { text: 'BALLOON RIDES', z: 28, sx: 1, bg: '#2a4a8a', fg: [250, 230, 140] });
  (m.landmarks ||= []).push({ name: 'Dry Creek Balloon Field', type: 'balloons', x: X0 * TILE, y: Y0 * TILE, w: (X1 - X0 + 1) * TILE, h: (Y1 - Y0 + 1) * TILE });
  m.natureSites.push({ kind: 'balloons', name: 'Dry Creek Balloon Field', x: Math.round((X0 + X1) / 2 * TILE), y: Math.round((Y0 + Y1) / 2 * TILE), balloons: 3 });
}

// ---- Willow River Orchard (Dry Creek, below the vineyard; original) ------------------------------------------------
// An apple orchard on the watered ground between the vineyard and the head of the Farm Road: trees in rows on green
// grass, a row of oranges at the bottom, ladders against the trees and crates of fruit in the alleys, a
// wheelbarrow, beehives along the top for the blossom, and a fruit stand at the road with its sign.
function orchard(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const X0 = 1100, X1 = 1131, Y0 = 438, Y1 = 463;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !(m.reserve[i] & RES) && (m.dist[i] === 9 || m.dist[i] === 41);
  for (let ty = Y0 - 1; ty <= Y1 + 1; ty++) for (let tx = X0 - 1; tx <= X1 + 1; tx++) if (!open(at(tx, ty))) return;
  const road = (m.edges || []).find((e) => e.name === 'Farm Road' && e.lvl === 0);
  if (!road) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= (X0 - 1) * TILE && q.x < (X1 + 2) * TILE && q.y >= (Y0 - 1) * TILE && q.y < (Y1 + 2) * TILE) dropProp(m, i); });
  for (let ty = Y0 - 1; ty <= Y1 + 1; ty++) for (let tx = X0 - 1; tx <= X1 + 1; tx++) { const i = at(tx, ty); m.tiles[i] = T.GRASS; m.reserve[i] |= RES | 128; }
  let n = 0;
  for (let ty = Y0 + 1.5, r = 0; ty <= Y1 - 1; ty += 3.2, r++) for (let tx = X0 + 1.5, c = 0; tx <= X1 - 1; tx += 3.2, c++) {
    add('tree_a', tx + (r % 2) * 0.3, ty, 10, { sp: r === 7 ? 'orange' : 'apple', k: 1.15 + hash2(c, r, 3601) * 0.2 }); n++;
    (m.pickables ||= []).push({ x: Math.round((tx + (r % 2) * 0.3) * TILE), y: Math.round(ty * TILE), item: r === 7 ? 'orange' : 'apple' });
  }
  // the work in the alleys: ladders against trees, crates of picked fruit, a wheelbarrow
  for (const [tx, ty] of [[X0 + 4.2, Y0 + 2.6], [X0 + 13.8, Y0 + 9], [X0 + 23.4, Y0 + 15.4], [X0 + 8.8, Y0 + 18.6]]) { add('ladder', tx, ty, 0); add('fruitcrate', tx + 1.2, ty + 1.1, 0); add('fruitcrate', tx + 1.7, ty + 1.3, 0); }
  add('wheelbarrow', X0 + 17.2, Y0 + 6.1, 0);
  for (let j = 0; j < 5; j++) add('beehive', X0 + 2 + j * 1.6, Y0 - 0.6, 6, { v: j % 3 });
  // the fruit stand at the head of the Farm Road, its sign, crates of apples
  const end = road.pts.reduce((b, q) => (!b || q.y < b.y ? q : b), null);
  const sx = end.x / TILE - 3.2, sy = end.y / TILE + 3;
  if (open(at(sx, sy)) || (m.reserve[at(sx, sy)] & RES) === 0) {
    add('stand', sx, sy, 12);
    for (const dx of [-1.4, 1.4]) add('fruitcrate', sx + dx, sy + 0.9, 0);
    add('textsign', sx, sy - 1.6, 0, { text: 'FRESH APPLES', z: 26, sx: 1, bg: '#8a2a24', fg: [250, 236, 200] });
    m.parking.push({ x: Math.round((sx + 0.4) * TILE), y: Math.round((sy + 2.4) * TILE), a: Math.PI / 2, drive: true });
  }
  (m.landmarks ||= []).push({ name: 'Willow River Orchard', type: 'orchard', x: X0 * TILE, y: Y0 * TILE, w: (X1 - X0 + 1) * TILE, h: (Y1 - Y0 + 1) * TILE });
  m.natureSites.push({ kind: 'orchard', name: 'Willow River Orchard', x: Math.round((X0 + X1) / 2 * TILE), y: Math.round((Y0 + Y1) / 2 * TILE), trees: n });
}

// ---- Willow River Vineyard (Dry Creek Desert, east of the river; original) --------------------------------------------
// Rows of grapevines on trellises across the open ground south of the oil field road: two blocks either side of a
// gravel track, reds on the west, whites on the east, green grass alleys between the rows. The winery stands at the
// top by the road: a honey-stone hall with a terracotta roof and a bell tower, its front on a gravel courtyard with
// an old olive tree, barrels by the door, a tasting terrace with tables, umbrellas and string lights; Italian
// cypresses line the drive in from the road under a ranch gate and the vineyard's sign; olives and lavender round
// the edges. (Vines are solid: you walk the alleys.)
function vineyard(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const X0 = 1105, X1 = 1166, Y0 = 384, NR = 16, Y1 = Y0 + NR * 3, TX = 1135, WX = 1121, WY = 369;   // vines; the track; the winery
  let ry = WY; while (ry > WY - 12 && m.tiles[at(WX, ry)] !== T.ROAD) ry--;
  if (m.tiles[at(WX, ry)] !== T.ROAD) return;
  const open = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !(m.reserve[i] & RES) && (m.dist[i] === 9 || m.dist[i] === 41);   // (Dry Creek, the desert's edge)
  for (let ty = ry + 2; ty <= Y1 + 2; ty++) for (let tx = X0 - 3; tx <= X1 + 3; tx++) if (!open(at(tx, ty))) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= (X0 - 3) * TILE && q.x < (X1 + 4) * TILE && q.y >= (ry + 1) * TILE && q.y < (Y1 + 3) * TILE) dropProp(m, i); });
  for (let ty = ry + 1; ty <= Y1 + 2; ty++) for (let tx = X0 - 3; tx <= X1 + 3; tx++) { const i = at(tx, ty); if (open(i)) m.reserve[i] |= RES; }
  // the vines: a dirt strip under each row, grass alleys between (lush: watered), the gravel track down the middle
  for (let ty = Y0 - 1; ty < Y1; ty++) for (let tx = X0; tx <= X1; tx++) {
    const i = at(tx, ty);
    if (tx === TX || tx === TX + 1) { m.tiles[i] = T.PLAZA; continue; }
    if ((ty - Y0) % 3 === 0) m.tiles[i] = T.DIRT; else { m.tiles[i] = T.GRASS; m.reserve[i] |= 128; }
  }
  for (let r = 0; r < NR; r++) {
    const y = (Y0 + r * 3 + 0.5) * TILE;
    for (const [a, b, kind] of [[X0, TX, 0], [TX + 2, X1 + 1, 1]]) {
      for (let x = a; x < b; x += 5) {
        const len = Math.min(5, b - x) * TILE;
        H.addProp(m, 'vinerow', Math.round(x * TILE + len / 2), Math.round(y), 0, { len, v: (r * 7 + x) % 4, kind });
        for (let d = 8; d < len; d += 24) m.addSolidProp(Math.round(x * TILE + d), Math.round(y), 6);
        for (let d = 24; d < len; d += 48) (m.pickables ||= []).push({ x: Math.round(x * TILE + d), y: Math.round(y), item: 'grapes', vine: 1 });
      }
    }
  }
  // the winery at the top, its courtyard (gravel) in front, the drive in from the road on the west side
  const DX = WX - 11;
  for (let ty = ry + 1; ty <= WY + 9; ty++) for (const tx of [DX, DX + 1]) m.tiles[at(tx, ty)] = T.PLAZA;
  for (let ty = WY + 2; ty <= WY + 9; ty++) for (let tx = DX; tx <= WX + 12; tx++) m.tiles[at(tx, ty)] = T.PLAZA;
  // (the drive, the courtyard and the track draw as pale gravel: park grounds with no paved plaza)
  const none = { x: 0, y: 0, w: 0, h: 0 };
  (m.parkGrounds ||= []).push({ x: DX * TILE, y: (ry + 1) * TILE, w: 2 * TILE, h: (WY + 9 - ry) * TILE, plaza: none }, { x: DX * TILE, y: (WY + 2) * TILE, w: (WX + 13 - DX) * TILE, h: 8 * TILE, plaza: none }, { x: TX * TILE, y: (Y0 - 1) * TILE, w: 2 * TILE, h: (Y1 - Y0 + 1) * TILE, plaza: none });
  add('winery', WX, WY, 0);
  for (let dx = -126; dx <= 126; dx += 24) for (const dy of [-46, -12, 22]) m.addSolidProp(Math.round(WX * TILE + dx), Math.round(WY * TILE + dy), 18);
  for (const dx of [-5.6, 5.6]) add('barrels', WX + dx, WY + 2.5, 12, { a: 0 });
  add('barrels', WX + 12.2, WY + 3.9, 12, { a: Math.PI / 2 });
  add('fountain', WX - 6.6, WY + 6.2, 26);
  add('tree_a', WX, WY + 6.4, 12, { sp: 'olive', k: 1.5 });
  for (const [dx, dy] of [[-1.6, 1.6], [1.6, 1.6], [-1.6, -1.2], [1.6, -1.2]]) add('shrub_a', WX + dx, WY + 6.4 + dy, 0, { sp: 'lavender', k: 1 });
  // the tasting terrace on the courtyard's east side: tables under umbrellas, string lights on posts over them
  for (const [dx, dy, u] of [[6.5, 4.6, 'umbrella_g'], [9.6, 4.6, 'umbrella_y'], [6.5, 7.8, 'umbrella_y'], [9.6, 7.8, 'umbrella_g']]) { add('cafetable', WX + dx, WY + dy, 6); add(u, WX + dx + 0.9, WY + dy + 0.4, 4); }
  const posts = [[WX + 5, WY + 3.4], [WX + 11.4, WY + 3.4], [WX + 11.4, WY + 9.2], [WX + 5, WY + 9.2]];
  for (const [tx, ty] of posts) add('post', tx, ty, 5, { h: 46 });
  for (let k = 0; k < 4; k++) { const [ax, ay] = posts[k], [bx, by] = posts[(k + 1) % 4]; add('festoon', ax, ay, 0, { tx: Math.round((bx - ax) * TILE), ty: Math.round((by - ay) * TILE), h: 44 }); }
  add('festoon', posts[0][0], posts[0][1], 0, { tx: Math.round((posts[2][0] - posts[0][0]) * TILE), ty: Math.round((posts[2][1] - posts[0][1]) * TILE), h: 44 });
  // the drive: cypresses either side, the ranch gate and the sign at the road
  for (let ty = ry + 3.5; ty <= WY + 2; ty += 2.6) for (const dx of [-1.2, 3.2]) add('tree_a', DX + dx, ty, 10, { sp: 'cypress', k: 1.3 });
  add('gatearch', DX + 1, ry + 1.9, 0, { w: 92 });
  add('textsign', DX - 3.8, ry + 2.6, 0, { text: 'WILLOW RIVER VINEYARD', z: 30, sx: 1, bg: '#5a2a34', fg: [240, 220, 170] });
  // round the edges: olive trees down the west side, lavender along the courtyard, cypresses at the corners
  for (let ty = Y0; ty < Y1; ty += 5) add('tree_a', X0 - 1.8, ty + 1.3, 12, { sp: 'olive', k: 1.3 + hash2(ty, 1, 3201) * 0.2 });
  for (let tx = DX + 3; tx < WX - 5; tx += 1.4) add('shrub_a', tx, WY + 9.7, 0, { sp: 'lavender', k: 0.9 });
  for (const [tx, ty] of [[X1 + 1.6, Y0 - 1.5], [X1 + 1.6, Y1 + 0.5], [X0 - 1.6, Y1 + 0.8]]) add('tree_a', tx, ty, 10, { sp: 'cypress', k: 1.4 });
  m.parking.push({ x: Math.round((DX + 3) * TILE), y: Math.round((WY + 6) * TILE), a: 0, drive: true });
  (m.landmarks ||= []).push({ name: 'Willow River Vineyard', type: 'vineyard', x: X0 * TILE, y: (ry + 1) * TILE, w: (X1 - X0 + 1) * TILE, h: (Y1 - ry) * TILE });
  m.natureSites.push({ kind: 'vineyard', name: 'Willow River Vineyard', x: Math.round(WX * TILE), y: Math.round((WY + 6) * TILE), winery: { x: WX * TILE, y: WY * TILE }, rows: NR * 2, gate: { x: Math.round((DX + 1) * TILE), y: Math.round((ry + 2) * TILE) }, track: TX });
}

// ---- Westport Pier (the Westport coast below the airport; original, with the NK1-C dock kit) -------------------
// The side road that runs west from the coast road to the sea goes on as a long timber fishing pier out over the
// bay, with a T-head at the end: rails along both sides, black iron lamps in pairs, benches facing the water, life
// rings, a bait and tackle shack, a fish-cleaning table, a cooler, a coin telescope looking out to sea, a Ferris
// wheel lit up at night, gulls on the rail posts, a float off the head's south side with two little boats tied up
// and a gap in the rail to reach it.
// Ashore: sand either side of the pier (a lifeguard tower, umbrellas, towels and a surfboard), a lawn behind with
// fan palms, picnic tables and benches facing the sunset, a snack cart by the pier, and the pier's lit sign.
// The pier faces west: the sun sets over its end.
function westportPier(m, H) {
  const D = 27, RY = 750;   // Westport International's coast strip; the side road's centre line (tile rows 749|750)
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const wet = (i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
  let sx = 150;
  while (sx > 100 && m.tiles[at(sx - 1, RY)] === T.ROAD) sx--;
  if (m.tiles[at(sx, RY)] !== T.ROAD || m.dist[at(sx, RY)] !== D || !wet(at(sx - 3, RY))) return;
  // the shaft: L tiles out from the road's end, rows RY-2..RY+1; the head: 8 x 12 tiles at its end; the float
  const L = 26, HX0 = sx - L - 7, HX1 = sx - L, HY0 = RY - 6, HY1 = RY + 5, FX0 = HX0 + 2, FX1 = HX0 + 5;
  const deck = [];
  for (let tx = HX1 + 1; tx < sx; tx++) for (let ty = RY - 2; ty <= RY + 1; ty++) deck.push([tx, ty]);
  for (let tx = HX0; tx <= HX1; tx++) for (let ty = HY0; ty <= HY1; ty++) deck.push([tx, ty]);
  for (let tx = FX0; tx <= FX1; tx++) for (let ty = HY1 + 1; ty <= HY1 + 2; ty++) deck.push([tx, ty]);
  for (const [tx, ty] of deck) { const i = at(tx, ty); if (tx < sx - 4 && !wet(i)) return; if (m.reserve[i] & RES) return; }
  for (let ty = HY0 - 3; ty <= HY1 + 6; ty++) for (let tx = HX0 - 3; tx <= HX1 + 2; tx++) if (!wet(at(tx, ty))) return;   // (open water round the head)
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  const solidLine = (x0, y0, x1, y1, r = 6) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 16)); for (let k = 0; k <= n; k++) m.addSolidProp(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, r); };
  for (const [tx, ty] of deck) { const i = at(tx, ty); m.tiles[i] = T.DOCK; m.land[i] = 0; m.reserve[i] |= RES | 16; }
  // the rails (pieces of up to 6 tiles; solid: the only ways off are the shore and the float's gap)
  const rail = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0), n = Math.max(1, Math.ceil(len / 192)), seg = len / n;
    for (let k = 0; k < n; k++) { const cx = x0 + Math.cos(a) * seg * (k + 0.5), cy = y0 + Math.sin(a) * seg * (k + 0.5); H.addProp(m, 'pierrail', Math.round(cx), Math.round(cy), 0, { len: Math.round(seg), a }); }
    solidLine(x0, y0, x1, y1);
  };
  const T0 = TILE, yN = (RY - 2) * T0 + 3, yS = (RY + 2) * T0 - 3, xE = sx * T0, xH = (HX1 + 1) * T0 - 3;
  rail(xH, yN, xE, yN); rail(xH, yS, xE, yS);                                                    // along the shaft
  rail(HX0 * T0 + 3, HY0 * T0 + 3, xH + 3, HY0 * T0 + 3);                                         // the head: north side
  rail(HX0 * T0 + 3, HY0 * T0 + 3, HX0 * T0 + 3, (HY1 + 1) * T0 - 3);                             // west side
  rail(HX0 * T0 + 3, (HY1 + 1) * T0 - 3, FX0 * T0, (HY1 + 1) * T0 - 3);                           // south side, west of the gap
  rail((FX1 + 1) * T0, (HY1 + 1) * T0 - 3, xH + 3, (HY1 + 1) * T0 - 3);                           // ...east of it
  rail(xH, HY0 * T0 + 3, xH, yN); rail(xH, yS, xH, (HY1 + 1) * T0 - 3);                            // the head's east side, either side of the shaft
  // lamps in pairs along the shaft and at the head's corners; benches between them facing out; life rings
  for (let k = 0; k < 4; k++) {
    const lx = sx - 2.5 - k * 6.5;
    add('lamp', lx, RY - 1.55, 5, { style: 'iron', lift: 4 }); add('lamp', lx, RY + 1.55, 5, { style: 'iron', lift: 4 });
    const bx = lx - 3.2;
    if (bx > HX1 + 2) { add('pbench', bx, RY - 1.45, 8, { a: -Math.PI / 2, lift: 4 }); add('pbench', bx, RY + 1.5, 8, { a: Math.PI / 2, lift: 4 }); }
  }
  for (const [tx, ty] of [[HX0 + 0.7, HY0 + 0.7], [HX1 + 0.3, HY0 + 0.7], [HX0 + 0.7, HY1 + 0.3], [HX1 + 0.3, HY1 + 0.3]]) add('lamp', tx, ty, 5, { style: 'iron', lift: 4 });
  for (const [tx, ty] of [[sx - 9.5, RY - 1.62], [sx - 16, RY + 1.62], [HX0 + 0.62, RY - 3.5], [HX0 + 0.62, RY + 3.5]]) add('lifering', tx, ty, 0);
  // rods in holders on the rails, out over the water (left by whoever's fishing there)
  for (const [tx, ty, a] of [[sx - 7.2, RY - 1.75, 0], [sx - 13.8, RY - 1.75, 0], [sx - 20.3, RY + 1.78, Math.PI], [HX0 + 3.2, HY1 + 0.75, Math.PI], [HX1 - 1.4, HY1 + 0.75, Math.PI]]) add('rods', tx, ty, 0, { a });
  // the head: the bait shack along the north rail, its sign, the cleaning table, a cooler and crates, benches facing
  // west along the end rail, the telescope at the very end, gulls on the rail posts
  const shx = HX0 + 4.1, shy = HY0 + 2.2;
  add('baitshack', shx, shy, 0);
  for (const dx of [-48, -24, 0, 24, 48]) m.addSolidProp(Math.round(shx * TILE + dx), Math.round(shy * TILE - 6), 20);
  add('textsign', HX0 + 1.5, HY0 + 5.2, 0, { text: 'BAIT & TACKLE', z: 24, sx: 1, bg: '#24506e', fg: [250, 240, 210] });
  add('fishtable', HX1 - 1.0, HY0 + 5.4, 8, { a: 0 });
  add('cooler', HX1 - 0.3, HY0 + 6.3, 0, { v: 1, lift: 4 }); add('crates', HX0 + 7.4, HY0 + 1.4, 10, { lift: 4 });
  add('pbench', HX0 + 1.0, RY - 1.6, 8, { a: Math.PI, lift: 4 }); add('pbench', HX0 + 1.0, RY + 1.8, 8, { a: Math.PI, lift: 4 });
  add('pbench', HX0 + 5.8, HY1 + 0.5, 8, { a: Math.PI / 2, lift: 4 });
  add('scope', HX0 + 0.8, RY + 0.1, 6, { lift: 4 });
  // the Ferris wheel on the head's south side, lit at night (its legs solid; you walk under the wheel to the deck)
  add('ferris', HX0 + 4, HY1 - 1.3, 0);
  for (const sd of [-1, 1]) for (const dy of [-12, 12]) m.addSolidProp(Math.round((HX0 + 4) * TILE + sd * 60), Math.round((HY1 - 1.3) * TILE + dy), 6);
  for (const [tx, ty, a] of [[HX0 + 0.1, RY - 5.2, 2.4], [sx - 12.1, RY - 1.95, -0.6], [HX1 + 0.92, HY1 + 0.8, 0.9]]) add('gull', tx, ty, 0, { a, z: 30 });
  // the float: two little boats tied up, cleats at its corners
  add('canoe', FX0 + 1.6, HY1 + 3.35, 0, { a: 0, c: 0 }); add('canoe', FX1 + 1.5, HY1 + 2.0, 0, { a: Math.PI / 2, c: 2 });
  for (const [tx, ty] of [[FX0 + 0.3, HY1 + 2.7], [FX1 + 0.7, HY1 + 2.7]]) add('mooring', tx, ty, 0, { lift: 4 });
  m.marina.push({ x: Math.round((FX0 + 2) * TILE), y: Math.round((HY1 + 4.6) * TILE), a: Math.PI });
  // ashore: a beach either side of the pier, the lawn behind it (to the coast road's sidewalk)
  let roadX = sx; while (roadX < sx + 30 && !(m.tiles[at(roadX, RY - 14)] === T.SIDEWALK || m.tiles[at(roadX, RY - 14)] === T.ROAD)) roadX++;
  const north = [RY - 44, RY - 5], south = [RY + 6, RY + 44], shore = (ty) => { let tx = sx - 6; while (tx < sx + 6 && wet(at(tx, ty))) tx++; return tx; };
  const land = (i) => m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND;
  for (const [y0, y1] of [north, south]) for (let ty = y0; ty <= y1; ty++) {
    const x0 = shore(ty);
    for (let tx = x0; tx < roadX; tx++) {
      const i = at(tx, ty);
      if (!land(i) || m.dist[i] !== D) continue;
      m.props.forEach((q, j) => { if (q && q.t !== 'painted' && Math.floor(q.x / TILE) === tx && Math.floor(q.y / TILE) === ty) dropProp(m, j); });
      if (tx < x0 + 6) { m.tiles[i] = T.SAND; m.reserve[i] |= RES | 4; } else { m.tiles[i] = T.GRASS; m.reserve[i] |= RES; }
    }
  }
  // the beach: a lifeguard tower on the south beach, umbrellas, towels, a surfboard; the north beach quieter
  const sxS = shore(RY + 22);
  add('lifeguard', sxS + 2.6, RY + 22, 16);
  for (const [dy, u, tw] of [[9, 'umbrella_r', 0], [14, 'umbrella_y', 1], [30, 'umbrella_b', 2], [37, 'umbrella_r', 0]]) { const bx = shore(RY + dy) + 3.2; add(u, bx, RY + dy, 4); add('towel', bx - 1.1, RY + dy + 0.9, 0, { v: tw }); }
  add('surfboard', sxS + 4.6, RY + 20.6, 0, { v: 2 });
  for (const [dy, u] of [[-14, 'umbrella_g'], [-30, 'umbrella_y']]) { const bx = shore(RY + dy) + 3.2; add(u, bx, RY + dy, 4); add('towel', bx + 0.9, RY + dy + 1, 0, { v: 1 }); }
  // the lawn: fan palms in loose rows, picnic tables and benches facing the sea, the snack cart by the pier
  const lx0 = shore(RY - 20) + 7;
  for (const [y0, y1] of [north, south]) for (let ty = y0 + 2, k = 0; ty <= y1 - 2; ty += 4.5, k++) {
    const tx = lx0 + 1 + (k % 2) * 4.5 + hash2(k, y0, 3101) * 1.2;
    if (tx < roadX - 2) add('palm_a', tx, ty, 10, { sp: k % 3 === 1 ? 'royal' : 'fanSkirt', k: 1.35 + hash2(k, y0, 3102) * 0.3 });
  }
  for (const [y0, y1] of [north, south]) for (let ty = y0 + 4, k = 0; ty <= y1 - 4; ty += 9, k++) {
    add('picnic', lx0 + 3, ty + 2.2, 8);
    add('pbench', lx0 - 0.4, ty - 0.6, 8, { a: Math.PI });
  }
  add('foodcart', sx + 2.2, RY - 3.9, 10); add('umbrella_r', sx + 3.8, RY - 3.4, 4); add('cafetable', sx + 0.6, RY - 3.2, 6);
  add('textsign', sx + 1.6, RY + 3.75, 0, { text: 'WESTPORT PIER', z: 50, bg: '#1d3f6e', fg: [255, 226, 120] });
  // the seal islets out in the bay to the west (the telescope looks at them): seals hauled out on the sand along
  // their shores, more on a barnacled rock between them, gulls, driftwood
  const isl = (tx, ty) => { const i = at(tx, ty); return m.dist[i] === 20 && (m.tiles[i] === T.SAND || m.tiles[i] === T.DIRT || m.tiles[i] === T.GRASS); };
  let ns = 0;
  for (let ty = HY0 - 44; ty <= HY1 + 6 && ns < 14; ty += 1) for (let tx = HX0 - 34; tx < HX0 - 8 && ns < 14; tx++) {
    const i = at(tx, ty);
    if (m.tiles[i] !== T.SAND || !isl(tx, ty) || hash2(tx, ty, 3501) > 0.16) continue;
    let sea = null; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (wet(at(tx + dx, ty + dy))) sea = [dx, dy];
    if (!sea) continue;
    const a = Math.atan2(sea[1], sea[0]) + (hash2(tx, ty, 3502) - 0.5) * 1.4;   // (facing the water, more or less)
    H.addProp(m, 'seal', Math.round((tx + 0.5) * TILE), Math.round((ty + 0.5) * TILE), 0, { pose: hash2(tx, ty, 3503) < 0.4 ? 1 : 0, a });
    ns++;
  }
  if (ns) {
    const rx = (HX0 - 12) * TILE, ry = (RY - 22) * TILE;
    if (wet(at(rx / TILE, ry / TILE))) {
      H.addProp(m, 'sealrock', Math.round(rx), Math.round(ry), 40, { w: 110, d: 64 });
      for (const [dx, dy, pz, a] of [[-22, -4, 0, 0.4], [20, 6, 1, 2.6]]) H.addProp(m, 'seal', Math.round(rx + dx), Math.round(ry + dy), 0, { pose: pz, a, z: 30 });
      H.addProp(m, 'gull', Math.round(rx + 4), Math.round(ry - 14), 0, { a: 1.2, z: 34 });
    }
  }
  // (the seals' islets get a name on the map when there are seals on them)
  if (ns >= 4) (m.landmarks ||= []).push({ name: 'Seal Islets', type: 'seals', x: (HX0 - 34) * TILE, y: (HY0 - 40) * TILE, w: 26 * TILE, h: 44 * TILE });
  (m.landmarks ||= []).push({ name: 'Westport Pier', type: 'pier', x: HX0 * TILE, y: HY0 * TILE, w: (sx - HX0) * TILE, h: (HY1 - HY0 + 3) * TILE });
  m.natureSites.push({ kind: 'pier', name: 'Westport Pier', x: Math.round((sx - 2) * TILE), y: RY * TILE, head: { x: Math.round((HX0 + HX1 + 1) / 2 * TILE), y: RY * TILE }, len: L, root: { x: sx * TILE, y: RY * TILE } });
}

// ---- Route 9 (Dry Creek Desert; concept D14) ---------------------------------------------------------------------
// The roadside stop out in the desert, dressed like the concept: a fuel forecourt with pumps under a canopy in front
// of the filling station, a water tower, the oil lease behind a rail fence (pump jacks, a flare stack, tanks), a dirt
// airstrip on the east side with a light plane, a windsock and edge lights, a bench and planters at the diner, a
// vending machine and a phone at the quick stop, saguaros, prickly pear, ocotillo, sandstone boulders, tumbleweeds.
// The buildings and their businesses stay as they are (countryside.js stop: the quick stop, the diner, the fuel).
function route9(m, H) {
  const s = (m.countrySites || []).find((q) => q.name === 'Route 9');
  const by = (n) => m.buildings.find((b) => b && b.name === n);
  const fuel = by('Route 9 Fuel'), qs = by('Route 9 Quick Stop'), dn = by('Route 9 Diner');
  if (!s || !fuel || !qs || !dn) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const open = (tx, ty) => { const t = m.tiles[at(tx, ty)]; return t === T.GRASS || t === T.DIRT || t === T.SAND; };
  const clear = (x0, y0, x1, y1) => m.props.forEach((p, i) => { if (p && p.t !== 'painted' && p.x >= x0 * TILE && p.x < x1 * TILE && p.y >= y0 * TILE && p.y < y1 * TILE) dropProp(m, i); });
  // (paving waits till the map's businesses are placed - map.js lateTiles - or a bank would move onto the forecourt)
  const mine = new Set();
  const claim = (x0, y0, x1, y1, t = null) => { for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) { if (!open(tx, ty)) continue; if (t) (m._late ||= []).push(at(tx, ty), t); m.reserve[at(tx, ty)] |= RES; if (t) mine.add(at(tx, ty)); } };
  const solidRun = (ax, ay, bx, by) => { H.addProp(m, 'rail', ax * TILE, ay * TILE, 0, { tx: (bx - ax) * TILE, ty: (by - ay) * TILE }); const L = Math.hypot(bx - ax, by - ay) * TILE; for (let k = 0; k <= L; k += 16) m.addSolidProp((ax + (bx - ax) * k / L) * TILE, (ay + (by - ay) * k / L) * TILE, 7); };
  const X0 = s.x, X1 = s.x + s.w, Y0 = s.y, Y1 = s.y + s.h, apronY = Y1 - 4;
  // the fuel forecourt: paved from the diner's east wall to the lot's edge, pumps on two islands under a canopy
  const fx0 = dn.tx + dn.tw + 1, fy0 = fuel.ty + fuel.th;
  clear(fx0, fy0, X1, apronY);
  claim(fx0, fy0, X1, apronY, T.LOT);
  const pcx = (fx0 + X1) / 2;
  // (one island of four pumps: one long canopy over them, statics.js addSetPieces)
  for (const [dx, dy] of [[-3.6, 5.5], [-1.2, 5.5], [1.2, 5.5], [3.6, 5.5]]) { const x = (pcx + dx) * TILE, y = (fy0 + dy) * TILE; (m.sitePumps ||= []).push({ x, y }); m.addSolidProp(x, y, 9); }
  add('propane', X1 - 1.6, apronY - 1.2, 10, { a: Math.PI / 2 });
  add('tires', fuel.tx - 0.8, fuel.ty + 1.6, 8); add('drum', fuel.tx - 1.6, fuel.ty + 0.8, 6); add('drum', fuel.tx - 2.3, fuel.ty + 1.3, 6);
  // at the diner and the quick stop
  const fy = dn.ty + dn.th + 0.45;
  add('planter_g', dn.tx + 0.7, fy, 6); add('bench_m', dn.tx + dn.tw - 3.4, fy, 6); add('trashcan', dn.tx + dn.tw - 1.7, fy, 5); add('planter_g', dn.tx + dn.tw - 0.5, fy, 6);   // (clear of the door and the cash machine beside it)
  add('news_a', dn.tx - 0.6, fy - 0.2, 4); add('news_b', dn.tx - 1.3, fy - 0.2, 4);
  const qy = qs.ty + qs.th + 0.6;
  add('vend_cola', qs.tx + 0.8, qy, 7); add('phonebox', qs.tx + qs.tw - 0.8, qy, 8); add('trashcan', qs.tx + 2.2, qy, 5);
  // behind: a rail fence along the back of the lot, the water tower at its east end
  clear(X0 - 1, Y0 - 18, X1 + 4, Y0);
  solidRun(X0, Y0 - 1.3, X1 + 0.5, Y0 - 1.3);
  add('watertower', X1 + 1.6, Y0 + 0.4, 16, { h: 92 });
  // the oil lease past the fence: nodding donkeys, a flare stack, two tanks with drums at their feet
  claim(X0 - 1, Y0 - 17, X1 + 4, Y0 - 1);
  [[X0 + 6, Y0 - 9.5, 0.1], [X0 + 18, Y0 - 13, 0.45], [X0 + 29, Y0 - 8.5, 0.8]].forEach(([tx, ty, ph]) => { if (open(tx, ty)) add('pumpjack', tx, ty, 18, { ph }); });
  if (open(X1 - 9, Y0 - 11)) add('flare', X1 - 9, Y0 - 11, 8);
  if (open(X1 - 1.5, Y0 - 8)) add('otank', X1 - 1.5, Y0 - 8, 26);
  if (open(X1 - 5.5, Y0 - 6.5)) add('propane', X1 - 5.5, Y0 - 6.5, 12, { a: 0 });
  for (let k = 0; k < 4; k++) add('drum', X1 - 6.2 + k * 0.7, Y0 - 4.6 + (k % 2) * 0.5, 6);
  // the airstrip east of the lot: a compacted strip with edge lights, an apron with the plane, a windsock
  const sx0 = X1 + 5, sy0 = Y0 + 4;
  let sx1 = sx0;
  while (sx1 < sx0 + 36 && [0, 1, 2, 3].every((k) => open(sx1, sy0 + k) && !(m.reserve[at(sx1, sy0 + k)] & ~RES))) sx1++;
  if (sx1 - sx0 >= 18) {
    clear(sx0 - 2, sy0 - 4, sx1 + 2, sy0 + 9);
    claim(sx0, sy0, sx1, sy0 + 4, T.LOT);
    claim(sx0, sy0 + 4, sx0 + 10, sy0 + 8, T.LOT);
    claim(sx0 - 2, sy0 - 3, sx1 + 2, sy0 + 9);
    for (let x = sx0 + 1; x < sx1; x += 4) { add('rwlight', x, sy0 + 0.15, 0, { c: 'w' }); add('rwlight', x, sy0 + 3.85, 0, { c: 'w' }); }
    for (const y of [sy0 + 1, sy0 + 2.5]) { add('rwlight', sx0 + 0.2, y, 0, { c: 'g' }); add('rwlight', sx1 - 0.2, y, 0, { c: 'r' }); }
    add('lplane', sx0 + 4.5, sy0 + 6.1, 26, { c: 0, a: 0 });
    add('windsock', sx0 + 13, sy0 - 1.8, 4, { a: 0.2 });
    add('drum', sx0 + 8.6, sy0 + 7.2, 6); add('drum', sx0 + 9.2, sy0 + 6.6, 6);
    m.natureSites.push({ kind: 'airstrip', name: 'Route 9 Airstrip', x: Math.round((sx0 + sx1) / 2 * TILE), y: Math.round((sy0 + 2) * TILE), plane: { x: Math.round((sx0 + 4.5) * TILE), y: Math.round((sy0 + 6.1) * TILE) } });
  }
  // the desert round it: saguaros, prickly pear, cholla, ocotillo, agave, yucca, creosote; sandstone boulders; tumbleweeds
  const near = (tx, ty, d) => { for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const t = m.tiles[at(tx + dx, ty + dy)]; if (t === T.ROAD || t === T.LOT || t === T.BUILDING || t === T.WATER || t === T.DEEP || t === T.WALL) return true; } return false; };
  const SMALL = ['pear', 'barrel', 'cholla', 'ocotillo', 'agave', 'yucca', 'creosote', 'brittle', 'pear', 'sage'];
  let nBig = 0, nSmall = 0, nRock = 0;
  for (let ty = Y0 - 22; ty < Y1 + 16; ty++) for (let tx = X0 - 14; tx < X1 + 44; tx++) {
    const h = hash2(tx, ty, 1901);
    if (h > 0.06 || !open(tx, ty) || (m.reserve[at(tx, ty)] & ~RES) || near(tx, ty, 1)) continue;
    if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => mine.has(at(tx + dx, ty + dy)))) || (tx >= X0 - 1 && tx < X1 + 4 && ty >= Y0 - 2 && ty < Y1)) continue;   // (the lot, the forecourt and the strip stay clear)
    if (tx >= X0 - 1 && tx < X1 + 4 && ty >= Y0 - 17 && ty < Y0 - 2 && h > 0.016) continue;   // (the lease: a few saguaros and rocks only)
    const jx = hash2(tx, ty, 1902) * 0.6 + 0.2, jy = hash2(tx, ty, 1903) * 0.6 + 0.2;
    if (h < 0.011 && nBig < 14) { add('tree_a', tx + jx, ty + jy, 8, { sp: h < 0.006 ? 'saguaroBig' : 'saguaroMid', k: 1.1 }); nBig++; }
    else if (h < 0.016 && nRock < 12) { add('boulder', tx + jx, ty + jy, 18, { s: 26 + Math.round(hash2(tx, ty, 1904) * 22) }); nRock++; }
    else if (h < 0.019) add('shrub_a', tx + jx, ty + jy, 0, { sp: 'tumble', k: 1 });
    else if (nSmall < 70) { add('shrub_a', tx + jx, ty + jy, 0, { sp: SMALL[Math.floor(hash2(tx, ty, 1905) * SMALL.length)], k: 1 }); nSmall++; }
  }
  // signs: a curve warning on the way in, the message board at the lot's west end
  add('mapboard', X0 - 1.4, apronY + 1.2, 10);
  add('roadsign', X0 + (s.w >> 1) - 4, Y1 + 3, 4, { k: 'curve', a: 0 });
  m.natureSites.push({ kind: 'diner', name: 'Route 9', x: Math.round((X0 + s.w / 2) * TILE), y: Math.round((apronY + 2) * TILE), forecourt: { x: Math.round(pcx * TILE), y: Math.round((fy0 + 6) * TILE) } });
}

// ---- Pine Lake (Highland Woods; concept D15) -------------------------------------------------------------------
// A lake in the pines between the Highland stop and the Pine Ridge Campground. A red boathouse on the north shore
// with a dock out into the water, a rowboat tied up at it and a canoe on the bank; a lakeside camp on the east shore
// (two tents, a fire, a table, chairs, a cooler, a woodpile, a fallen log) at the end of a dirt track from the
// Highland stop, a timber guard rail where the track runs along the water; the outlet creek runs over rocks to the
// bay, crossed by a timber footbridge on the trail up from the campground; a trailhead board and finger posts;
// firs, pines and cedars round it all, thick on the north and west, mossy boulders, ferns, reeds, lily pads.
function pineLake(m, H) {
  const LX = 136, LY = 216, RX = 12, RY = 6.5, D = 29;
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const land = (i) => m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND;
  const free = (tx, ty) => { const i = at(tx, ty); return land(i) && !m.reserve[i] && m.dist[i] === D; };
  for (let ty = LY - RY - 4; ty <= LY + RY + 4; ty++) for (let tx = LX - RX - 4; tx <= LX + RX + 4; tx++) if (!free(tx, ty)) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  const clearR = (tx, ty, r) => m.props.forEach((p, i) => { if (p && p.t !== 'painted' && Math.hypot(p.x / TILE - tx, p.y / TILE - ty) < r) dropProp(m, i); });
  const way = (cp, r) => { const pts = spline(cp.map(([x, y]) => [x * TILE, y * TILE]), 16); for (const [x, y] of pts) { clearR(x / TILE, y / TILE, r / TILE + 1); paint(m, x, y, r, T.DIRT, (t) => t === T.GRASS || t === T.DIRT || t === T.SAND); } return pts; };
  clearR(LX, LY, RX + 6);
  // the lake: a wobbly oval, deep in the middle
  const wet = new Set();
  for (let ty = Math.floor(LY - RY - 2); ty <= LY + RY + 2; ty++) for (let tx = Math.floor(LX - RX - 2); tx <= LX + RX + 2; tx++) {
    const dx = (tx + 0.5 - LX) / RX, dy = (ty + 0.5 - LY) / RY, a = Math.atan2(dy, dx), q = Math.hypot(dx, dy) / (1 + 0.1 * Math.sin(a * 3 + 1.3) + 0.05 * Math.sin(a * 5 + 0.4));
    if (q > 1) continue;
    const i = at(tx, ty); m.tiles[i] = q < 0.55 ? T.DEEP : T.WATER; m.lake[i] = 1; m.reserve[i] |= RES; wet.add(i);
  }
  // the outlet creek from the lake's north-west end to the bay (land only: the sea stays sea)
  const creek = spline([[LX - RX * 0.82, LY - RY * 0.45], [LX - RX - 6, LY - 5.2], [LX - RX - 15, LY - 5.8], [LX - RX - 24, LY - 4.6], [LX - RX - 33, LY - 3.6], [LX - RX - 44, LY - 3]].map(([x, y]) => [x * TILE, y * TILE]), 12);
  for (const [x, y] of creek) clearR(x / TILE, y / TILE, 2);
  for (let k = 0; k < creek.length; k++) {
    const [x, y] = creek[k], hw = 18 + (k / creek.length) * 8;
    for (let ty = Math.floor((y - hw) / TILE); ty <= Math.floor((y + hw) / TILE); ty++) for (let tx = Math.floor((x - hw) / TILE); tx <= Math.floor((x + hw) / TILE); tx++) {
      const i = ty * MAP_W + tx;
      if (Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > hw || !land(i)) continue;
      m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES; wet.add(i);
    }
  }
  for (let k = 8; k < creek.length - 4; k += 5) { const [x, y] = creek[k], s = k % 2 ? 1 : -1; add('boulder', x / TILE + s * 1.3, y / TILE + s * 0.4, 12, { s: 14 + (k * 7) % 12, moss: 1 }); }
  // the freshwater shore for the reed beds (statics.js coverAt reads distRiver, quarter tiles)
  if (m.distRiver) for (const i of wet) { m.distRiver[i] = 0; const tx = i % MAP_W, ty = Math.floor(i / MAP_W); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = (ty + dy) * MAP_W + tx + dx; if (wet.has(j)) continue; const d = Math.round(Math.hypot(dx, dy) * 4); if (!m.distRiver[j] || m.distRiver[j] > d) m.distRiver[j] = d; } }
  const wetAt = (tx, ty) => wet.has(at(tx, ty));
  // the boathouse on the north shore over the water's edge, its dock out into the lake, a rowboat tied up at it
  let ny = LY; while (wetAt(LX - 2, ny - 1)) ny--;
  const BX = LX - 2, BY = ny - 0.6;
  clearR(BX, BY, 4);
  add('boathouse', BX, BY, 30);
  reserveRound(m, BX * TILE, BY * TILE, 3.5 * TILE);
  const PXT = BX + 3.4;
  let pe = ny;
  for (let k = 0; k < 5; k++) { const i = at(PXT, ny + k); if (!wet.has(i) && k > 0) break; for (const o of [-0.5, 0.5]) { const j = at(PXT + o, ny + k); if (wet.has(j) || land(j)) { m.tiles[j] = T.DOCK; m.lake[j] = 0; m.reserve[j] |= RES; } } pe = ny + k + 1; }
  add('pier', Math.floor(PXT + 0.5), (ny + pe) / 2, 0, { len: Math.round((pe - ny) * TILE + 12), w: 62, a: Math.PI / 2 });
  add('canoe', PXT + 1.5, pe - 1.2, 0, { a: Math.PI / 2, c: 2 });
  add('canoe', BX - 4.2, BY + 0.2, 0, { a: 0.25, c: 0 });
  // the camp on the east shore at the end of the track from the Highland stop
  let ex = LX; while (wetAt(ex + 1, LY + 1)) ex++;
  const CX = ex + 5, CY = LY + 1.5;
  clearR(CX, CY, 6);
  paint(m, CX * TILE, CY * TILE, 4.2 * TILE, T.DIRT, (t) => t === T.GRASS || t === T.DIRT || t === T.SAND);
  add('tent', CX - 1.8, CY - 2.6, 12, { v: 0 }); add('tent', CX + 2.4, CY - 1.9, 12, { v: 2 });
  add('campfire', CX + 0.2, CY + 0.6, 0, { lit: true });
  add('picnic', CX - 2.6, CY + 1.9, 8); add('chair', CX + 1.5, CY + 1.4, 0, { a: Math.PI * 1.2, v: 1 }); add('chair', CX - 0.9, CY + 1.8, 0, { a: -0.4, v: 2 });
  add('cooler', CX + 2.4, CY + 2.5, 0, { v: 1 }); add('woodpile', CX + 3.6, CY - 3.6, 8); add('log', CX + 0.4, CY + 3.4, 10, { len: 100, a: 0.05, moss: 1 });   // (a seat south of the fire)
  m.parking.push({ x: Math.round((CX + 4.2) * TILE), y: Math.round((CY + 2.6) * TILE), a: -Math.PI / 2, drive: true });
  // (nothing tall just south of the camp or the boathouse: in this view it would stand up over them)
  for (let ty = Math.floor(CY); ty < CY + 10; ty++) for (let tx = Math.floor(CX - 7); tx < CX + 7; tx++) { const i = at(tx, ty); if (land(i)) m.reserve[i] |= RES; }
  add('mapboard', CX + 5.2, CY - 1.4, 10);
  // the dirt track in from the Highland stop's lot, a timber guard rail where it runs along the water
  const stop = (m.countrySites || []).find((q) => q.name === 'Highland');
  if (stop) {
    const pts = way([[stop.x - 0.5, stop.y + stop.h - 2.5], [stop.x - 9, stop.y + stop.h - 4], [CX + 14, CY + 6], [CX + 6, CY + 3.2]], 40);
    for (let k = 0; k < pts.length - 6; k += 6) {
      const [x, y] = pts[k], [x2, y2] = pts[k + 6], tx = x / TILE, ty = y / TILE;
      let nearWater = false; for (let dy = -4; dy <= 0; dy++) for (let dx = -4; dx <= 4; dx++) if (wetAt(tx + dx, ty + dy)) nearWater = true;
      if (!nearWater) continue;
      const a = Math.atan2(y2 - y, x2 - x);
      add('creekrail', (x - Math.sin(a) * 46) / TILE, (y + Math.cos(a) * 46) / TILE, 0, { len: Math.round(Math.hypot(x2 - x, y2 - y)), a });
    }
  }
  // the trail up from the Pine Ridge Campground, over the creek on a timber footbridge, round the north shore
  const camp = (m.countrySites || []).find((q) => q.name === 'Pine Ridge Campground');
  let bridge = null;
  if (camp) {
    const tp = way([[camp.x + camp.w - 2, camp.y + 0.5], [camp.x + camp.w + 4, camp.y - 7], [LX - RX - 24.5, LY - 1], [LX - RX - 23.5, LY - 10], [LX - RX - 14, LY - 11.5], [LX - RX - 2, LY - 10.5], [BX - 4, BY - 2.5]], 22);
    // where it crosses the creek: planks over the water, the footbridge over them
    const cross = tp.filter(([x, y]) => wet.has(at(x / TILE, y / TILE)) && m.river[at(x / TILE, y / TILE)]);
    if (cross.length) {
      const mx = cross.reduce((s, q) => s + q[0], 0) / cross.length, my = cross.reduce((s, q) => s + q[1], 0) / cross.length;
      const k = tp.findIndex((q) => q === cross[0]), a = Math.atan2(tp[Math.min(tp.length - 1, k + 4)][1] - tp[Math.max(0, k - 4)][1], tp[Math.min(tp.length - 1, k + 4)][0] - tp[Math.max(0, k - 4)][0]);
      for (let d = -64; d <= 64; d += 8) for (const o of [-12, 12]) { const i = at((mx + Math.cos(a) * d - Math.sin(a) * o) / TILE, (my + Math.sin(a) * d + Math.cos(a) * o) / TILE); if (wet.has(i)) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES; } }
      add('fbridge', mx / TILE, my / TILE, 0, { len: 150, a });
      bridge = { x: Math.round(mx), y: Math.round(my) };
    }
    add('fingerpost', camp.x + camp.w + 4.8, camp.y - 6.4, 4);
  }
  // the woods round it: firs, pines and cedars (thick to the north and west), mossy boulders on the shore, reeds
  // and cattails at the water, ferns and huckleberry under the trees; lily pads and ducks out on the lake
  const TREES = ['fir', 'pondPine', 'fir', 'spruce', 'cedar'];
  let nt = 0;
  for (let ty = Math.floor(LY - RY - 10); ty <= LY + RY + 9; ty++) for (let tx = Math.floor(LX - RX - 12); tx <= LX + RX + 12; tx++) {
    const i = at(tx, ty);
    if (!land(i) || m.dist[i] !== D || m.reserve[i]) continue;   // (the camp, the track and the trail are reserved: they stay open)
    let shore = 9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (wet.has(i + dy * MAP_W + dx)) shore = Math.min(shore, Math.max(Math.abs(dx), Math.abs(dy)));
    const h = hash2(tx, ty, 2101), north = ty < LY - 2 || tx < LX - RX + 2;
    if (shore === 1) { if (h < 0.34) add('shrub_a', tx + 0.5, ty + 0.5, 0, { sp: h < 0.16 ? 'cattails' : 'reeds', k: 1 }); else if (h > 0.86) add('boulder', tx + 0.5, ty + 0.5, 12, { s: 12 + Math.round(h * 14), moss: 1 }); continue; }
    if (Math.hypot(tx + 0.5 - CX, ty + 0.5 - CY) < 6.5 || Math.hypot(tx + 0.5 - BX, ty + 0.5 - BY) < 4.5) continue;
    if (h < (north ? 0.2 : 0.09) && shore > 2) { add('tree_a', tx + 0.3 + hash2(tx, ty, 2102) * 0.4, ty + 0.3 + hash2(tx, ty, 2103) * 0.4, 10, { sp: TREES[Math.floor(hash2(tx, ty, 2104) * TREES.length)], k: 1.15 + hash2(tx, ty, 2105) * 0.3 }); m.reserve[i] |= RES; nt++; }
    else if (h < 0.27) add('shrub_a', tx + 0.5, ty + 0.5, 0, { sp: ['fern', 'huckle', 'salal', 'fern'][Math.floor(hash2(tx, ty, 2106) * 4)], k: 1 });
    else if (h > 0.975) add('boulder', tx + 0.5, ty + 0.5, 14, { s: 18 + Math.round(hash2(tx, ty, 2107) * 18), moss: 1 });
  }
  // the shore band stays as it is drawn here (the wild woods, map.js buildWilds, fill the unreserved ground after: no
  // redwood stands in the water's edge)
  for (const i of wet) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * MAP_W + dx; if (land(j) && m.dist[j] === D) m.reserve[j] |= RES; }
  for (let j = 0; j < 8; j++) { const tx = LX - RX * 0.7 + hash2(j, 1, 2108) * RX * 0.9, ty = LY - RY * 0.5 + hash2(j, 2, 2108) * RY; if (wetAt(tx, ty) && !wetAt(tx, ty - 1.5) === false) add('lily', tx, ty, 0, { v: j % 4 }); }
  add('duck', LX + 3, LY + 1.5, 0, { a: 0.5 }); add('duck', LX + 4.2, LY + 2.1, 0, { a: 0.8 });
  (m.landmarks ||= []).push({ name: 'Pine Lake', type: 'lake', x: Math.round((LX - RX) * TILE), y: Math.round((LY - RY) * TILE), w: Math.round(RX * 2 * TILE), h: Math.round(RY * 2 * TILE) });
  m.natureSites.push({ kind: 'lakecamp', name: 'Pine Lake', x: LX * TILE, y: LY * TILE, boathouse: { x: Math.round(BX * TILE), y: Math.round(BY * TILE) }, camp: { x: Math.round(CX * TILE), y: Math.round(CY * TILE) }, pier: { x: Math.round(PXT * TILE), y: Math.round(((ny + pe) / 2) * TILE) }, bridge, trees: nt });
}

// ---- Cedar Creek (Lake District, Cedar Falls; concepts NK1-K, NK1-L, NK1-H) ------------------------------------
// The two ponds east of Cedar Falls joined by a creek: it spills out of the north pond over a mossy ledge (the little
// falls the town is named for), winds south between rocky banks under willows, birches and blossom, runs under Falls
// Road through a two-arch stone culvert with parapets, and on past a stone arch footbridge into the south pond. A
// dirt trail follows it from shore to shore (a timber footbridge where it changes banks), with benches, lamps and
// park signs; reeds and cattails in the shallows, stepping stones, mossy rocks and logs on the banks.
function cedarCreek(m, H) {
  const LUSH = 128, at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const AX = 600, AY = 950, BX = 592, BY = 1025;
  if (!m.lake[at(AX, AY)] || !m.lake[at(BX, BY)] || m.dist[at(AX, AY)] !== 37) return;
  const road = (m.roads || []).find((r) => r.name === 'Falls Road' && r.lvl === 0 && r.pts.some((q) => Math.abs(q.x / TILE - AX) < 30 && Math.abs(q.y / TILE - 988) < 8));
  if (!road) return;
  let ay = AY; while (m.lake[at(AX, ay + 1)]) ay++;              // the north pond's south shore (its last water row)
  let by = BY; while (m.lake[at(BX, by - 1)]) by--;              // the south pond's north shore
  // where the creek crosses the road: the road's segment over x AX, its direction
  let C = null;
  for (let k = 1; k < road.pts.length; k++) { const a = road.pts[k - 1], b = road.pts[k]; if ((a.x - AX * TILE) * (b.x - AX * TILE) <= 0 && a.x !== b.x) { const t = (AX * TILE - a.x) / (b.x - a.x); C = { x: AX * TILE, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) }; break; } }
  if (!C) return;
  const RW = 176;                                                 // (the road with its sidewalks, half)
  // the creek: out of the north pond, a bend west, back east, square under the road, two bends, into the south pond
  const cy = C.y / TILE;
  const pts = spline([[AX + 1, ay - 0.5], [AX + 0.5, ay + 3], [AX - 3, ay + 7], [AX + 1.5, cy - 7], [AX, cy - 2], [AX, cy + 2], [AX - 1.5, cy + 7], [AX + 3, cy + 13], [AX - 2.5, cy + 20], [BX + 1, by + 0.5]].map(([x, y]) => [x * TILE, y * TILE]), 12);
  // (nothing of the park's dressing may stand in it or on its banks)
  m.props.forEach((q, i) => { if (!q || q.t === 'painted') return; const [d] = nearest(pts, q.x, q.y); if (d < 3 * TILE) dropProp(m, i); });
  const wet = carveWater(m, pts, (s) => 28 + 8 * Math.sin(s * 19) + (s < 0.06 ? 10 : 0));
  for (const i of wet) m.lake[i] = 0;
  const wetSet = new Set(wet);
  // the banks: lush (reeds to the water, meadow flowers further up), designed
  for (const i of wet) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = i + dy * MAP_W + dx; if (m.tiles[j] === T.GRASS && m.dist[j] === 37) m.reserve[j] |= RES | LUSH; }
  if (m.distRiver) for (const i of wet) { m.distRiver[i] = 0; const tx = i % MAP_W, ty = Math.floor(i / MAP_W); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = (ty + dy) * MAP_W + tx + dx; if (wetSet.has(j)) continue; const d = Math.round(Math.hypot(dx, dy) * 4); if (!m.distRiver[j] || m.distRiver[j] > d) m.distRiver[j] = d; } }
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  const ptAt = (s) => pts[Math.max(0, Math.min(pts.length - 1, Math.round(s * (pts.length - 1))))];
  const side = (s, off) => { const k = Math.max(1, Math.min(pts.length - 1, Math.round(s * (pts.length - 1)))), [x0, y0] = pts[k - 1], [x1, y1] = pts[k], l = Math.hypot(x1 - x0, y1 - y0) || 1; return [(x1 - (y1 - y0) / l * off) / TILE, (y1 + (x1 - x0) / l * off) / TILE]; };
  // the falls: over a mossy ledge just below the north pond (facing south: the water falls toward you)
  const F = [pts[0][0], (ay + 2.6) * TILE];
  // the culvert's mouths stay clear (no reeds grow in front of the arches)
  for (const i of wet) { const ty = Math.floor(i / MAP_W); if (Math.abs(ty + 0.5 - cy) < RW / TILE + 2.5) for (let dx = -2; dx <= 2; dx++) m.reserve[i + dx] |= 16; }
  // the culvert under the road: the stone faces with their arches and parapets (statics.js draws the bridge)
  for (const sd of [-1, 1]) for (let u = -70; u <= 70; u += 20) m.addSolidProp(C.x + Math.cos(C.a) * u - Math.sin(C.a) * sd * (RW + 6), C.y + Math.sin(C.a) * u + Math.cos(C.a) * sd * (RW + 6), 8);
  // the trail: from the north pond's shore down the west bank to the road, over a timber footbridge to the east bank
  // below the road, down to the south pond; dirt, kept clear
  const trailPts = (cp) => { const tp = spline(cp.map(([x, y]) => [x * TILE, y * TILE]), 14); for (const [x, y] of tp) paint(m, x, y, 22, T.DIRT, (t) => t === T.GRASS || t === T.DIRT); return tp; };
  trailPts([[AX - 6, ay + 1.5], [AX - 7.5, ay + 5], [AX - 5, cy - 12]]);
  const t2 = trailPts([[AX - 5, cy - 12], [AX + 0, cy - 12.2], [AX + 5.5, cy - 12.4]]);   // (over the creek: the footbridge)
  trailPts([[AX + 5.5, cy - 12.4], [AX + 6.5, cy - 8.5], [AX + 5.5, cy - 5.5]]);          // (to the road's sidewalk)
  trailPts([[AX + 5.5, cy + 5.5], [AX + 6.5, cy + 10], [AX + 2.5, by - 2.5], [BX + 6, by + 0.5]]);
  // planks where the trail crosses the water (the footbridge stands on them)
  let fb = null;
  { const cross = t2.filter(([x, y]) => wetSet.has(at(x / TILE, y / TILE))); if (cross.length) { const mx = cross.reduce((a, q) => a + q[0], 0) / cross.length, my = cross.reduce((a, q) => a + q[1], 0) / cross.length; for (let d = -80; d <= 80; d += 8) for (const o of [-12, 12]) { const i = at((mx + d) / TILE, (my + o) / TILE); if (wetSet.has(i)) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES; } } fb = { x: mx, y: my }; add('fbridge', mx / TILE, my / TILE, 0, { len: 130, a: 0 }); } }
  // the stone arch footbridge below the road (a path across from the east trail to the west lawn)
  const sb = ptAt(0.78), ab = { x: sb[0], y: sb[1] };
  { for (let d = -64; d <= 64; d += 8) for (const o of [-12, 12]) { const i = at((ab.x + d) / TILE, (ab.y + o) / TILE); if (wetSet.has(i)) { m.tiles[i] = T.DOCK; m.reserve[i] |= RES; } } add('archbridge', ab.x / TILE, ab.y / TILE, 0, { len: 5 * TILE }); trailPts([[ab.x / TILE - 2.6, ab.y / TILE], [ab.x / TILE - 6, ab.y / TILE + 1.5], [ab.x / TILE - 10, ab.y / TILE + 1]]); trailPts([[ab.x / TILE + 2.6, ab.y / TILE], [ab.x / TILE + 5.4, ab.y / TILE + 0.4]]); }
  // the banks: mossy rocks and stepping stones, logs, reeds and cattails, ferns and flowering shrubs
  const grass = (x, y) => m.tiles[at(x, y)] === T.GRASS || m.tiles[at(x, y)] === T.DIRT;
  for (const [s, off, r] of [[0.1, -40, 12], [0.14, 44, 14], [0.2, -38, 10], [0.33, 40, 11], [0.37, -42, 13], [0.6, 40, 12], [0.66, -44, 10], [0.86, 42, 12], [0.9, -40, 11]]) { const [x, y] = side(s, off); if (grass(x, y)) add('boulder', x, y, r, { s: r * 2 + 4, moss: 1 }); }
  for (const [s, off] of [[0.5, -12], [0.52, 6], [0.54, 18]]) { const [x, y] = side(s, off); add('boulder', x, y, 0, { s: 10, moss: 1 }); }   // (stepping stones)
  for (const [s, off, a] of [[0.27, -60, 0.15], [0.64, -64, -0.2]]) { const [x, y] = side(s, off); if (grass(x, y)) add('log', x, y, 10, { len: 90, a, moss: 1 }); }   // (lying across the view: along it they read as posts)
  for (let k = 0; k < 26; k++) { const s = hash2(k, 1, 2201), off = (hash2(k, 2, 2201) < 0.5 ? -1 : 1) * (36 + hash2(k, 3, 2201) * 12), [x, y] = side(s, off); if (m.tiles[at(x, y)] === T.GRASS && Math.abs(y - cy) > (RW / TILE) + 2.5) add('shrub_a', x, y, 0, { sp: ['reeds', 'cattails', 'fern', 'hydrangea', 'berryShrub', 'reeds'][k % 6], k: 1 }); }
  // trees: willows by the ponds, birches, blossom and maples along the creek, oaks further out
  const TREES = [[0.05, -90, 'willow', 1.45], [0.04, 96, 'willow', 1.4], [0.18, 84, 'birch', 1.3], [0.24, -96, 'cherry', 1.3], [0.3, 92, 'maple', 1.4], [0.42, -88, 'flowerTree', 1.3], [0.62, 96, 'birch', 1.3], [0.68, -92, 'magnolia', 1.3], [0.8, 100, 'cherry', 1.3], [0.92, -86, 'willow', 1.45], [0.96, 104, 'oak', 1.5]];
  for (const [s, off, sp, k] of TREES) { const [x, y] = side(s, off); if (m.tiles[at(x, y)] === T.GRASS) { add('tree_a', x, y, 12, { sp, k }); reserveRound(m, x * TILE, y * TILE, 40); } }
  // by the trail: benches facing the water, lamps, park signs at each end
  for (const [s, off, a] of [[0.12, -70, 0], [0.88, 76, 0]]) { const [x, y] = side(s, off); if (grass(x, y)) add('pbench', x, y, 0, { a }); }
  for (const [s, off] of [[0.2, -66], [0.7, 66], [0.95, 70]]) { const [x, y] = side(s, off); if (grass(x, y)) add('lamp', x, y); }
  add('parksign', AX - 7.6, cy - 3.6, 0); add('parksign', AX + 7.2, cy + 4.4, 0);
  (m.landmarks ||= []).push({ name: 'Cedar Creek Falls', type: 'falls', x: Math.round(F[0] - 160), y: Math.round(F[1] - 120), w: 320, h: 240 });
  m.natureSites.push({ kind: 'towncreek', name: 'Cedar Creek', x: Math.round(F[0]), y: Math.round(F[1] + 120), falls: { x: Math.round(F[0]), y: Math.round(F[1]), w: 64, drop: 22 }, bridge: { x: Math.round(C.x), y: Math.round(C.y), a: C.a, half: 70, roadHw: RW }, footbridge: fb && { x: Math.round(fb.x), y: Math.round(fb.y) }, arch: { x: Math.round(ab.x), y: Math.round(ab.y) } });
}

// ---- Wreck Island (the Islets) ------------------------------------------------------------------------------------
// The biggest of the Islets, west of the city: an old wooden ship run aground on its west beach, heeled over, its
// side stove in, the bow up the sand; its snapped mast and spars washed up along the tide line, barrels and crates
// spilled from the hold, a tattered tarp lean-to and a dead campfire where someone camped by it; gulls and crabs.
function wreckIsland(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  // the island: Islets land round (540, 636)
  if (!m.land[at(540, 636)] || m.dist[at(540, 636)] !== 20) return;
  // the west beach: from the island's middle row, west to the last sand before the sea
  const row = 636;
  let sx = 540; while (m.land[at(sx - 1, row)] && sx > 500) sx--;
  if (m.tiles[at(sx, row)] !== T.SAND) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.abs(q.x / TILE - (sx + 4)) < 9 && Math.abs(q.y / TILE - row) < 7) dropProp(m, i); });
  // the wreck: its stern in the shallows, the bow up the beach to the north-east (solid along its length)
  const a = -0.45, L = 220, X = (sx + 2.5) * TILE, Y = (row + 0.5) * TILE;
  add('wreck', X / TILE, Y / TILE, 0, { a });
  for (let u = -L / 2 + 20; u <= L / 2 - 16; u += 22) m.addSolidProp(X + Math.cos(a) * u, Y + Math.sin(a) * u, 22);
  for (let ty = row - 5; ty <= row + 4; ty++) for (let tx = sx - 3; tx <= sx + 8; tx++) m.reserve[at(tx, ty)] |= RES;
  // the mast and spars along the tide line, barrels and crates spilled up the beach, the castaway's camp
  add('driftwood', sx + 2.2, row + 4.4, 0, { len: 110, a: 0.55 }); add('driftwood', sx + 3.4, row - 4.4, 0, { len: 90, a: 0.3 });   // (the mast and a spar)
  for (const [dx, dy] of [[5.2, 1.6], [5.9, 2.3], [6.8, -1.2], [4.2, 3.6]]) add('barrel', sx + dx, row + dy, 8);
  for (const [dx, dy] of [[7.4, 0.6], [3.4, -3.4]]) add('crates', sx + dx, row + dy, 12);
  add('campfire', sx + 8.6, row + 3.2, 0, { lit: false }); add('tent', sx + 9.8, row + 1.6, 12, { v: 0 });
  add('gull', sx + 3.6, row - 1.2, 0, { a: 0.6, z: 30 }); add('gull', sx + 6.2, row + 4.8, 0, { a: 2.2 }); add('crab', sx + 1.6, row + 2.8, 0, { a: 1.2 }); add('crab', sx + 2.8, row - 3.2, 0, { a: 4.1 });
  (m.landmarks ||= []).push({ name: 'Wreck Island', type: 'wreck', x: (sx - 4) * TILE, y: (row - 8) * TILE, w: 40 * TILE, h: 16 * TILE });
  m.natureSites.push({ kind: 'wreck', name: 'Wreck Island', x: Math.round(X), y: Math.round(Y), beach: { x: (sx + 6) * TILE, y: (row + 1) * TILE } });
}

// ---- the Bluffs Maze Garden (The Bluffs) ------------------------------------------------------------------------
// The open lawn in the middle of The Bluffs becomes a formal garden: a square hedge maze (clipped yew walls taller
// than a person, solid) with a white gazebo and a fountain at its heart, four gates; round it gravel walks between
// rose parterres and topiary, avenues of cypress and flowering trees out to the streets, benches, lamps and urns.
// The maze is made fresh from a fixed seed (a depth-first walk over its cells), so it's the same for everyone.
function bluffsMaze(m, H) {
  const D = 34, at = (tx, ty) => ty * MAP_W + tx;
  const CX = 1128, CY = 146, N = 11;                        // the maze: N x N cells, 2 tiles each, walls 1 tile
  const S = 2 * N + 1, X0 = CX - (S >> 1), Y0 = CY - (S >> 1);
  const grass = (tx, ty) => { const i = at(tx, ty); return m.tiles[i] === T.GRASS && m.dist[i] === D; };
  for (let ty = Y0 - 6; ty < Y0 + S + 6; ty++) for (let tx = X0 - 6; tx < X0 + S + 6; tx++) if (!grass(tx, ty) || m.reserve[at(tx, ty)]) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  // the random dressing on this lawn goes (it was scattered by the town greenery)
  const GX0 = X0 - 22, GX1 = X0 + S + 22, GY0 = Y0 - 26, GY1 = Y0 + S + 22;
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= GX0 * TILE && q.x < GX1 * TILE && q.y >= GY0 * TILE && q.y < GY1 * TILE && grass(Math.floor(q.x / TILE), Math.floor(q.y / TILE))) dropProp(m, i); });
  for (let ty = GY0; ty < GY1; ty++) for (let tx = GX0; tx < GX1; tx++) if (grass(tx, ty)) m.reserve[at(tx, ty)] |= RES;
  // carve the maze: walls everywhere, then a depth-first walk opens the cells and the walls between them
  const wall = new Uint8Array(S * S).fill(1), seen = new Uint8Array(N * N), st = [[N >> 1, N >> 1]];
  const open = (cx, cy) => { wall[(2 * cy + 1) * S + 2 * cx + 1] = 0; };
  open(N >> 1, N >> 1); seen[(N >> 1) * N + (N >> 1)] = 1;
  let k = 0;
  while (st.length) {
    const [cx, cy] = st[st.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => { const x = cx + dx, y = cy + dy; return x >= 0 && y >= 0 && x < N && y < N && !seen[y * N + x]; });
    if (!nb.length) { st.pop(); continue; }
    const [dx, dy] = nb[Math.floor(hash2(cx * 31 + cy, k++, 2301) * nb.length)];
    wall[(2 * cy + 1 + dy) * S + 2 * cx + 1 + dx] = 0; open(cx + dx, cy + dy); seen[(cy + dy) * N + cx + dx] = 1; st.push([cx + dx, cy + dy]);
  }
  // the heart: a 3 x 3 clearing for the gazebo; the gates in the middle of each side
  const h0 = (S >> 1) - 2;
  for (let y = h0; y < h0 + 5; y++) for (let x = h0; x < h0 + 5; x++) wall[y * S + x] = 0;
  const mid = S >> 1;
  for (const [x, y] of [[mid, 0], [mid, S - 1], [0, mid], [S - 1, mid]]) wall[y * S + x] = 0;
  // (the cells either side of each gate open into the maze: the gate cell's neighbour inward is a cell already)
  // the walls: hedge tiles are solid (WALL; the ground bake draws them as lawn under the hedge), drawn as runs -
  // each row's horizontal runs as one hedge sprite, the single tiles of the vertical runs stacked
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = at(X0 + x, Y0 + y);
    m.tiles[i] = wall[y * S + x] ? T.WALL : T.DIRT;
    m.reserve[i] |= RES | 16;
  }
  for (let y = 0; y < S; y++) {
    let x = 0;
    while (x < S) {
      if (!wall[y * S + x]) { x++; continue; }
      let e = x; while (e + 1 < S && wall[y * S + e + 1]) e++;
      const len = e - x + 1;
      add('hedgebox', X0 + x + len / 2, Y0 + y + 1, 0, { w: len * TILE, d: TILE, h: 28, fl: (y === 0 || y === S - 1) ? '#e8f0e8' : null });   // (shoulder high: you see heads over it)
      x = e + 1;
    }
  }
  // the heart: the gazebo, a fountain basin and benches round it
  add('gazebo', CX + 0.5, CY + 0.6, 30);
  for (const [dx, dy] of [[-1.6, 2.1], [2.6, 2.1]]) add('pbench', CX + dx, CY + dy, 0, { a: 0 });
  // round the maze: a gravel walk all round it, rose parterres in the corners, topiary along the walk, urns at
  // the gates, lamps; avenues of cypress and flowering trees from the gates out to the edge of the lawn
  const ring = 3, R0x = X0 - ring, R0y = Y0 - ring, R1x = X0 + S + ring, R1y = Y0 + S + ring;
  for (let ty = R0y; ty < R1y; ty++) for (let tx = R0x; tx < R1x; tx++) { if (tx >= X0 - 1 && tx < X0 + S + 1 && ty >= Y0 - 1 && ty < Y0 + S + 1) continue; const edge = tx < R0x + 2 || tx >= R1x - 2 || ty < R0y + 2 || ty >= R1y - 2; if (edge && grass(tx, ty)) m.tiles[at(tx, ty)] = T.PLAZA; }
  for (let ty = Y0 - 1; ty < Y0 + S + 1; ty++) for (const tx of [X0 - 1, X0 + S]) if (grass(tx, ty)) m.tiles[at(tx, ty)] = T.PLAZA;
  for (let tx = X0 - 1; tx < X0 + S + 1; tx++) for (const ty of [Y0 - 1, Y0 + S]) if (grass(tx, ty)) m.tiles[at(tx, ty)] = T.PLAZA;
  // the avenues: 2-tile gravel walks from each gate to the streets
  const walk = (x0, y0, x1, y1) => { for (let ty = Math.min(y0, y1); ty <= Math.max(y0, y1); ty++) for (let tx = Math.min(x0, x1); tx <= Math.max(x0, x1); tx++) if (grass(tx, ty)) m.tiles[at(tx, ty)] = T.PLAZA; };
  const reach = (x, y, dx, dy) => { let n = 0; while (n < 40 && grass(x + dx * (n + 1), y + dy * (n + 1))) n++; return n; };
  const gates = [[CX, Y0 - ring - 1, 0, -1], [CX, Y0 + S + ring, 0, 1], [X0 - ring - 1, CY, -1, 0], [X0 + S + ring, CY, 1, 0]];
  const AV = ['cypress', 'cherry', 'cypress', 'magnolia'];
  for (const [gx, gy, dx, dy] of gates) {
    const n = reach(gx, gy, dx, dy);
    if (n < 3) continue;
    if (dx) walk(gx, gy, gx + dx * n, gy + 1); else walk(gx, gy, gx + 1, gy + dy * n);
    for (let s = 3; s < n - 1; s += 3) for (const side of [-1, 2]) { const tx = dx ? gx + dx * s + 0.5 : gx + side + 0.5, ty = dx ? gy + side + 0.5 : gy + dy * s + 0.5; if (grass(Math.floor(tx), Math.floor(ty))) add('tree_a', tx, ty, 10, { sp: AV[(s / 3) % AV.length | 0], k: 1.15 }); }
  }
  // the parterres: box-edged beds of roses, lavender and hydrangea in the four corners of the garden round the maze
  const SP = ['rose', 'lavender', 'hydrangea', 'rose'];
  for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = qx < 0 ? R0x - 9 : R1x + 1, by = qy < 0 ? R0y - 7 : R1y + 1;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { const tx = bx + 1 + i * 2, ty = by + 1 + j * 2; if (grass(tx, ty) && grass(tx + 1, ty)) add('shrub_a', tx + 0.5, ty + 0.5, 0, { sp: SP[(i + j) % 4], k: 1 }); }
    for (const [ex, ey] of [[bx, by], [bx + 8, by], [bx, by + 6], [bx + 8, by + 6]]) if (grass(ex, ey)) add('shrub_a', ex + 0.5, ey + 0.5, 0, { sp: 'topBall', k: 1 });
  }
  // topiary cones along the walk, lamps at its corners, urns (planters) at the gates, benches facing the maze
  for (let t = 4; t < S + 2 * ring - 4; t += 4) for (const [tx, ty] of [[R0x + t, R0y + 2.6], [R0x + t, R1y - 2.6], [R0x + 2.6, R0y + t], [R1x - 2.6, R0y + t]]) if (grass(Math.floor(tx), Math.floor(ty))) add('shrub_a', tx + 0.5, ty + 0.5, 0, { sp: 'topCone', k: 1 });
  for (const [tx, ty] of [[R0x + 1, R0y + 1], [R1x - 1, R0y + 1], [R0x + 1, R1y - 1], [R1x - 1, R1y - 1]]) add('lamp', tx, ty);
  for (const [tx, ty] of [[CX - 1.6, Y0 - 1.5], [CX + 2.6, Y0 - 1.5], [CX - 1.6, Y0 + S + 1.5], [CX + 2.6, Y0 + S + 1.5], [X0 - 1.5, CY - 1.6], [X0 - 1.5, CY + 2.6], [X0 + S + 1.5, CY - 1.6], [X0 + S + 1.5, CY + 2.6]]) add('planter_fl', tx, ty, 6);
  for (const [tx, ty] of [[CX - 6, R1y - 0.6], [CX + 7, R1y - 0.6], [CX - 6, R0y + 0.6], [CX + 7, R0y + 0.6]]) add('pbench', tx, ty, 0, { a: ty > CY ? 0 : Math.PI });
  // big shade trees out on the lawns between the avenues
  for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let j = 0; j < 3; j++) {
    const tx = CX + qx * (S / 2 + ring + 7 + hash2(qx + 3, j, 2302) * 8), ty = CY + qy * (S / 2 + ring + 2 + hash2(qy + 5, j, 2303) * 8);
    let ok = true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!grass(Math.floor(tx) + dx, Math.floor(ty) + dy)) ok = false;
    if (ok) add('tree_a', tx, ty, 12, { sp: j === 1 ? 'redMaple' : 'oak', k: 1.4 + hash2(qx, qy + j, 2304) * 0.2 });
  }
  (m.mazes ||= []).push({ x: X0 * TILE, y: Y0 * TILE, w: S * TILE, h: S * TILE });
  (m.landmarks ||= []).push({ name: 'Bluffs Maze Garden', type: 'maze', x: X0 * TILE, y: Y0 * TILE, w: S * TILE, h: S * TILE });
  m.natureSites.push({ kind: 'maze', name: 'Bluffs Maze Garden', x: Math.round((CX + 0.5) * TILE), y: Math.round((CY + 0.5) * TILE), gate: { x: Math.round((CX + 0.5) * TILE), y: Math.round((Y0 + S + 0.5) * TILE) }, size: S });
}

// ---- Granite Hot Springs (Granite Peaks; concept L7) -----------------------------------------------------------
// Three hot pools stepping down a granite hillside north of the coast highway: the spring wells up in the top pool
// under a rock face, spills in little cascades to the big middle pool and the lower one; boulders round every rim,
// steam over the water, stone lanterns and paper lanterns on posts, red maples and pines, a bamboo fence round the
// baths with a bath pavilion (benches, buckets, a bamboo spout) on the lower pool, stone steps up from the road.
// The water is hot spring water (m.springs: the ground bake's milky mineral blue-green); you can get in.
function hotSprings(m, H) {
  const D = 33, at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const open = (tx, ty) => { const i = at(tx, ty); return (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !m.reserve[i] && m.dist[i] === D; };
  const CX = 603, CY = 125;
  for (let ty = CY - 14; ty <= CY + 15; ty++) for (let tx = CX - 16; tx <= CX + 16; tx++) if (!open(tx, ty)) return;
  // the road below: the highway's north edge under the site
  let ry = CY + 15; while (ry < CY + 30 && m.tiles[at(CX, ry)] !== T.ROAD) ry++;
  if (m.tiles[at(CX, ry)] !== T.ROAD) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.abs(q.x / TILE - CX) < 17 && q.y / TILE > CY - 15 && q.y / TILE < ry) dropProp(m, i); });
  for (let ty = CY - 14; ty < ry; ty++) for (let tx = CX - 16; tx <= CX + 16; tx++) if (open(tx, ty)) m.reserve[at(tx, ty)] |= RES;
  // the pools: [cx, cy, rx, ry] in tiles - top (small, under the rock), middle (big), lower (by the pavilion)
  const POOLS = [[CX - 4, CY - 8, 4.2, 2.6], [CX + 1, CY - 2, 7.4, 3.4], [CX - 5, CY + 5, 5, 2.6]];
  const wet = [];
  for (const [px, py, rx, ry2] of POOLS) {
    for (let ty = Math.floor(py - ry2 - 1); ty <= py + ry2 + 1; ty++) for (let tx = Math.floor(px - rx - 1); tx <= px + rx + 1; tx++) {
      const dx = (tx + 0.5 - px) / rx, dy = (ty + 0.5 - py) / ry2, a = Math.atan2(dy, dx), q = Math.hypot(dx, dy) / (1 + 0.12 * Math.sin(a * 3 + px) + 0.06 * Math.sin(a * 5 + py));
      if (q > 1) continue;
      const i = at(tx, ty); m.tiles[i] = q < 0.5 && rx > 5 ? T.DEEP : T.WATER; m.reserve[i] |= RES | 16; wet.push(i);
    }
    (m.springs ||= []).push({ x: px * TILE, y: py * TILE, rx: (rx + 0.6) * TILE, ry: (ry2 + 0.6) * TILE });
  }
  const wetSet = new Set(wet), isWet = (tx, ty) => wetSet.has(at(tx, ty));
  // the rock face behind the top pool (solid granite) the spring wells out from
  const RX = CX - 4, RY = CY - 12;
  for (let ty = RY - 1; ty <= RY; ty++) for (let tx = RX - 4; tx <= RX + 4; tx++) { m.tiles[at(tx, ty)] = T.WALL; m.reserve[at(tx, ty)] |= RES; }
  add('outcrop', RX, RY + 1, 0, { w: 9 * TILE, d: 2 * TILE, h: 44, style: 'granite', s: 3 });
  add('fallsmall', RX + 0.5, RY + 1.6, 0, { w: 14, h: 26 });
  // the cascades: where each pool spills into the next (a little curtain of water over the rim stones)
  add('fallsmall', CX - 1.2, CY - 5.4, 0, { w: 18, h: 14 });
  add('fallsmall', CX - 3.4, CY + 2.2, 0, { w: 16, h: 12 });
  // boulders round every rim (solid, mossy granite), close-packed; steam over each pool
  let k = 0;
  for (const [px, py, rx, ry2] of POOLS) {
    const n = Math.round((rx + ry2) * 2.4);
    for (let j = 0; j < n; j++, k++) {
      const a = j / n * Math.PI * 2 + hash2(k, 1, 2501) * 0.3, rr = 1.12 + hash2(k, 2, 2501) * 0.18, tx = px + Math.cos(a) * rx * rr, ty = py + Math.sin(a) * ry2 * rr;
      if (isWet(tx, ty) || Math.abs(Math.sin(a)) > 0.92 && Math.sin(a) > 0 && px === CX + 1) continue;   // (a gap in the big pool's south rim: the way in)
      const sz = 22 + Math.round(hash2(k, 3, 2501) * 16);
      add('boulder', tx, ty, Math.round(sz * 0.5), { s: sz, style: 'basalt', moss: hash2(k, 4, 2501) < 0.25 ? 1 : 0 });   // (dark rocks round the hot water)
    }
    add('steam', px, py + ry2 * 0.4, 0, { w: Math.round(rx * TILE * 1.4), h: 46 + Math.round(rx * 3), s: Math.round(px + py) % 5 + 1 });
  }
  // the bath pavilion on the lower pool's west side, a bamboo fence round the baths (a gate on the south side)
  add('bathpav', CX - 12, CY + 5.4, 0);
  for (let tx = CX - 13; tx <= CX - 11; tx++) for (let ty = CY + 4; ty <= CY + 5; ty++) { const i = at(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) m.tiles[i] = T.WALL; }
  const fence = [[CX - 15, CY - 13, CX + 13, CY - 13], [CX - 15, CY - 13, CX - 15, CY + 9], [CX + 13, CY - 13, CX + 13, CY + 9], [CX - 15, CY + 9, CX - 2, CY + 9], [CX + 2, CY + 9, CX + 13, CY + 9]];
  for (const [ax, ay, bx, by] of fence) {
    const L = Math.hypot(bx - ax, by - ay), ns = ax === bx;
    for (let s0 = 0; s0 < L; s0 += 2.5) { const l = Math.min(2.5, L - s0); add('bamboo', ns ? ax : ax + s0 + l / 2, ns ? ay + s0 + l / 2 : ay, 0, { len: Math.round(l * TILE), a: ns ? Math.PI / 2 : 0 }); }
    for (let d = 0; d <= L * TILE; d += 16) m.addSolidProp((ax + (bx - ax) * d / (L * TILE)) * TILE, (ay + (by - ay) * d / (L * TILE)) * TILE, 7);
  }
  // stone steps up from the road through the gate: a flagstone path (plaza) to the big pool's south rim
  for (let ty = CY + 2; ty < ry; ty++) for (const tx of [CX - 1, CX, CX + 1]) { const i = at(tx, ty); if (!wetSet.has(i) && m.tiles[i] !== T.WALL && m.tiles[i] !== T.ROAD && m.tiles[i] !== T.SIDEWALK) m.tiles[i] = T.PLAZA; }
  // lanterns: stone lanterns by the pools, paper lanterns on posts along the path and at the gate
  for (const [tx, ty] of [[CX - 9, CY - 9], [CX + 9, CY - 6], [CX + 7, CY + 4], [CX - 9, CY + 1]]) add('stonelantern', tx, ty, 6);
  for (const [tx, ty] of [[CX - 2.2, CY + 9.6], [CX + 2.2, CY + 9.6], [CX - 2.2, CY + 13], [CX + 2.2, CY + 13]]) add('lantern', tx, ty, 4);
  // the trees: red maples (the concept's autumn colour) and pines inside and round the fence, ferns and moss rocks
  for (const [tx, ty, sp] of [[CX - 12, CY - 9, 'mapleAutumn'], [CX + 10, CY - 10, 'mtnPine'], [CX + 10, CY + 1, 'mapleAutumn'], [CX - 12, CY - 2, 'mtnPine'], [CX + 6, CY - 11, 'mapleAutumn'], [CX - 7, CY + 8, 'mapleAutumn']]) add('tree_a', tx, ty, 12, { sp, k: 1.3 });
  for (const [tx, ty, sp] of [[CX - 19, CY - 6, 'mtnPine'], [CX + 17, CY - 8, 'mapleAutumn'], [CX - 18, CY + 6, 'mapleAutumn'], [CX + 17, CY + 5, 'mtnPine'], [CX - 6, CY - 17, 'mtnPine'], [CX + 6, CY - 16, 'mtnFir'], [CX + 18, CY + 11, 'mapleAutumn'], [CX - 18, CY + 12, 'mtnPine']]) if (open(Math.floor(tx), Math.floor(ty)) || m.reserve[at(tx, ty)] & RES) add('tree_a', tx, ty, 12, { sp, k: 1.4 });
  for (let j = 0; j < 22; j++) { const tx = CX - 14 + hash2(j, 1, 2502) * 28, ty = CY - 12 + hash2(j, 2, 2502) * 20; const i = at(tx, ty); if ((m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !wetSet.has(i)) add('shrub_a', tx, ty, 0, { sp: ['fern', 'salal', 'fern', 'heather'][j % 4], k: 1 }); }
  (m.landmarks ||= []).push({ name: 'Granite Hot Springs', type: 'springs', x: (CX - 15) * TILE, y: (CY - 13) * TILE, w: 28 * TILE, h: 22 * TILE });
  m.natureSites.push({ kind: 'springs', name: 'Granite Hot Springs', x: Math.round((CX + 1) * TILE), y: Math.round((CY - 2) * TILE), gate: { x: CX * TILE + 16, y: (CY + 9) * TILE + 16 }, pools: POOLS.length });
}

// ---- Splash Bay Water Park (Gull Harbor; concept L3) -----------------------------------------------------------
// The open lawn behind Bonfire Beach becomes a water park inside a fence: a lazy river looping round a palm island
// with a rock waterfall; a slide tower with three slides (a blue tube, red and yellow open flumes) swinging down into
// their splash pools, a lifeguard chair at each; the changing block along the north side, a snack cart, loungers
// and striped umbrellas on the pale deck, palms; the gate on the road side under the park's sign. All the water is
// pool water (m.pools: a ring for the river, rects for the splash pools) - swim, no fishing.
function splashBay(m, H) {
  const X0 = 118, Y0 = 963, X1 = 161, Y1 = 984, D = 43;
  const at = (tx, ty) => ty * MAP_W + tx;
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) { const i = at(tx, ty); if ((m.tiles[i] !== T.GRASS && m.tiles[i] !== T.SAND) || m.reserve[i] || m.dist[i] !== D) return; }
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= (X0 - 1) * TILE && q.x < (X1 + 2) * TILE && q.y >= (Y0 - 1) * TILE && q.y < (Y1 + 2) * TILE) dropProp(m, i); });
  // the deck: everything inside the fence paved (pale slabs), reserved
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) { const i = at(tx, ty); m.reserve[i] |= RES | 16; m.tiles[i] = tx > X0 && tx < X1 && ty > Y0 && ty < Y1 ? T.PLAZA : T.GRASS; }
  const deck = { x: (X0 + 1) * TILE, y: (Y0 + 1) * TILE, w: (X1 - X0 - 1) * TILE, h: (Y1 - Y0 - 1) * TILE };
  // the lazy river: a ring channel round an island (grass, palms, a rock waterfall)
  const ring = { cx: 130 * TILE, cy: 975.4 * TILE, rx: 8.2 * TILE, ry: 5.1 * TILE, hw: 1.25 * TILE };
  for (let ty = Y0 + 1; ty < Y1; ty++) for (let tx = X0 + 1; tx < 142; tx++) {
    const X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE, q = Math.hypot((X - ring.cx) / ring.rx, (Y - ring.cy) / ring.ry), dd = (q - 1) * Math.min(ring.rx, ring.ry);
    if (Math.abs(dd) < ring.hw) m.tiles[at(tx, ty)] = T.WATER;
    else if (q < 1) m.tiles[at(tx, ty)] = T.GRASS;   // (the island)
  }
  (m.pools ||= []).push({ ring, x: ring.cx - ring.rx - ring.hw, y: ring.cy - ring.ry - ring.hw, w: (ring.rx + ring.hw) * 2, h: (ring.ry + ring.hw) * 2, lanes: 0, deck });
  for (const [tx, ty, sp] of [[127.5, 974.6, 'coconut'], [132.5, 976, 'royal'], [130, 973.9, 'coconut']]) add('tree_a', tx, ty, 10, { sp, k: 1.3 });
  add('outcrop', 130.5, 977.2, 0, { w: 90, d: 40, h: 34, style: 'granite', s: 2 }); add('fallsmall', 130.5, 977.6, 0, { w: 14, h: 20 });
  for (const [tx, ty, sp] of [[126.8, 976.6, 'hibiscus'], [133.8, 974.8, 'bird'], [128.6, 972.9, 'monstera']]) add('shrub_a', tx, ty, 0, { sp, k: 1 });
  for (const [tx, ty, v] of [[122.4, 974.6, 0], [137.7, 976.8, 2], [131, 970.3, 1], [125.6, 980.4, 3]]) add('ringfloat', tx, ty, 0, { v });
  // the slide tower (solid) at the north of the east half; three slides down to three splash pools
  const TX = 151, TY = 966;   // the tower's south face, tiles
  for (let ty = TY - 2; ty < TY; ty++) for (let tx = TX - 2; tx < TX + 2; tx++) m.tiles[at(tx, ty)] = T.WALL;
  add('stower', TX, TY - 0.9, 0);
  const SP = [[144, 'tube', '#2a6ab8'], [150, 'flume', '#d8342e'], [156, 'flume', '#e8b830']];
  SP.forEach(([px, kind, c], k) => {
    const pw = 4, ph = 4, py = 977, x = px - pw / 2;
    for (let ty = py; ty < py + ph; ty++) for (let tx = x; tx < x + pw; tx++) m.tiles[at(tx, ty)] = ty === py + ph - 1 || tx === x || tx === x + pw - 1 ? T.WATER : T.DEEP;
    (m.pools ||= []).push({ x: x * TILE, y: py * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck });
    const sx = (TX - 1 + k) * TILE + 16, sy = TY * TILE + 2;
    add('wslide', sx / TILE, sy / TILE, 0, { dx: px * TILE - sx, len: (py - TY) * TILE + 30, z: 84, kind, c });
    add('lguard', px + 2.6, py + 1.2, 12, { a: Math.PI });
  });
  // the changing block along the north side (solid), facing the deck; the snack cart by it, the gate on the west
  const bx0 = 120, bw = 9;
  for (let ty = Y0 + 1; ty <= Y0 + 2; ty++) for (let tx = bx0; tx < bx0 + bw; tx++) m.tiles[at(tx, ty)] = T.WALL;
  add('poolhouse', bx0 + bw / 2, Y0 + 2.75, 0, { w: bw * TILE, d: 2 * TILE - 4 });
  add('foodcart', 141, 967.4, 10); add('umbrella_r', 142.4, 967.8, 4); add('cafetable', 139.6, 968.6, 6); add('cafetable', 143.8, 969.2, 6);
  // loungers and umbrellas: along the east side, between the river and the slides, along the south fence
  let k = 0;
  for (let ty = 968; ty < 983; ty += 1.6, k++) { if (k % 3 === 1) add(k % 2 ? 'umbrella_b' : 'umbrella_y', 159.4, ty, 4); else add('lounger', 159.6, ty, 6, { a: Math.PI, v: k % 4 }); }
  k = 0;
  for (let tx = 121; tx < 140; tx += 1.7, k++) { if (k % 3 === 2) add(k % 2 ? 'umbrella_r' : 'umbrella_g', tx, 983.3, 4); else add('lounger', tx, 983.1, 6, { a: -Math.PI / 2, v: (k + 1) % 4 }); }
  for (const [tx, ty] of [[X0 + 1.2, Y0 + 1.2], [X1 - 0.8, Y0 + 1.2], [X1 - 0.8, Y1 - 0.8], [140.5, 983.4], [146.6, 982.6], [152.6, 982.6]]) add('tree_a', tx, ty, 8, { sp: 'royal', k: 1.15 });
  for (const [tx, ty] of [[X0 + 1.3, Y1 - 1.3], [139.6, 970.6], [139.6, 980.2]]) add('potted', tx, ty, 6);
  // the fence: chain-link all round on the tile lines (solid), the gate in the west side by the road
  const gy = 974;
  for (const [ax, ay, bx, by] of [[X0, Y0, X1 + 1, Y0], [X1 + 1, Y0, X1 + 1, Y1 + 1], [X0, Y1 + 1, X1 + 1, Y1 + 1], [X0, Y0, X0, gy - 1], [X0, gy + 2, X0, Y1 + 1]]) {
    add('chainfence', ax, ay, 0, { tx: (bx - ax) * TILE, ty: (by - ay) * TILE });
    const L = Math.hypot(bx - ax, by - ay) * TILE;
    for (let d = 0; d <= L; d += 16) m.addSolidProp((ax + (bx - ax) * d / L) * TILE, (ay + (by - ay) * d / L) * TILE, 7);
  }
  for (let tx = X0 - 4; tx <= X0; tx++) for (let ty = gy - 1; ty <= gy + 1; ty++) if (m.tiles[at(tx, ty)] === T.GRASS) { m.tiles[at(tx, ty)] = T.PLAZA; m.reserve[at(tx, ty)] |= RES; }   // (a path from the sidewalk to the gate)
  add('textsign', X0 - 2, gy - 1.3, 0, { text: 'SPLASH BAY', z: 46, bg: '#1a5a9a', fg: [255, 226, 90] });
  add('bikerack', X0 - 2.4, gy + 2.6, 6); add('trashcan', X0 - 1.2, gy + 2.4, 5);
  (m.landmarks ||= []).push({ name: 'Splash Bay Water Park', type: 'waterpark', x: X0 * TILE, y: Y0 * TILE, w: (X1 - X0 + 1) * TILE, h: (Y1 - Y0 + 1) * TILE });
  m.natureSites.push({ kind: 'waterpark', name: 'Splash Bay Water Park', x: Math.round(ring.cx), y: Math.round(ring.cy + ring.ry), gate: { x: X0 * TILE + 16, y: gy * TILE + 16 }, tower: { x: TX * TILE, y: TY * TILE } });
}

// ---- Driftwood Point (Cedar Hills; concept N8-D) ---------------------------------------------------------------
// The beach below the Cedar Point Wind Farm road: a band of columnar basalt cliffs under the road (a timber guard
// rail along its edge), a creek from the hills to the east that falls over the cliff to the sand, wooden steps down
// through a gap in the rock; on the beach driftwood logs, tidepools among barnacled rocks with starfish, urchins,
// anemones and crabs at the waterline, sea stacks in the surf; pines and beach grass on the cliff top.
function driftwoodPoint(m, H) {
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const road = (m.roads || []).find((r) => r.name === 'Cedar Point Wind Farm Road');
  if (!road) return;
  // the road's east-west stretch along the top of the beach
  let y0 = null, xa = 1e9, xb = -1e9;
  for (let k = 1; k < road.pts.length; k++) { const a = road.pts[k - 1], b = road.pts[k]; if (Math.abs(a.y - b.y) < 4 && Math.abs(a.x - b.x) > 200) { y0 = a.y; xa = Math.min(a.x, b.x); xb = Math.max(a.x, b.x); } }
  if (y0 === null) return;
  const RY = Math.floor((y0 + (road.hw || 64)) / TILE) + 1;   // (the first row south of the road)
  const X0 = Math.floor(xa / TILE) + 1, X1 = Math.floor(xb / TILE) - 1;
  const sandOr = (tx, ty) => { const t = m.tiles[at(tx, ty)]; return t === T.SAND || t === T.DIRT || t === T.GRASS; };
  for (let tx = X0; tx <= X1 + 4; tx++) for (let ty = RY; ty < RY + 3; ty++) if (!sandOr(tx, ty) || m.reserve[at(tx, ty)]) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= (X0 - 4) * TILE && q.x < (X1 + 14) * TILE && q.y >= (RY - 1) * TILE && q.y < (RY + 22) * TILE) dropProp(m, i); });
  // the cliff band: three rows of solid rock under the road, a gap for the steps
  const GX = X0 + 4;
  for (let tx = X0 - 2; tx <= X1 + 3; tx++) for (let ty = RY; ty < RY + 2; ty++) {
    const i = at(tx, ty);
    if (!sandOr(tx, ty)) continue;
    m.reserve[i] |= RES;
    if (tx === GX || tx === GX + 1) { m.tiles[i] = T.DIRT; continue; }   // (the steps' gap)
    m.tiles[i] = T.WALL;
  }
  // the cliff faces (columnar basalt, mossy tops), their feet on the row below the band
  const footY = (RY + 2) * TILE, D = 56;
  for (const [a, b, sd] of [[X0 - 2, GX, 1], [GX + 2, X1 + 4, 2]]) {
    for (let x = a; x < b; x += 6) { const l = Math.min(6, b - x); if (l < 2) continue; add('cliffwall', x + l / 2, footY / TILE - D / 2 / TILE, 0, { len: l * TILE, h: 70 + ((x * 7) % 3) * 6, d: D, s: sd + x }); }
  }
  // the wooden steps down through the gap, their foot on the sand
  add('stairs', GX + 1, RY + 2.6, 0, { len: 2 * TILE + 16, h: 70, w: 30 });
  // the guard rail along the road's south edge (timber posts and rails on a stone kerb), a gap at the steps
  for (const [a, b] of [[X0 - 1, GX - 0.2], [GX + 2.2, X1 + 1]]) { const len = (b - a) * TILE; if (len > 40) add('creekrail', (a + b) / 2, RY + 0.35, 0, { len, a: 0, z: 68 }); }   // (up on the cliff top)
  // the creek: from the hills to the east, round the road's end, over the cliff to the beach, across it to the sea
  const FX = X1 + 2.5;
  // (from the open hills east of the wind farm, south of its fence, never through it)
  const farm = (m.countrySites || []).find((q) => q.type === 'wind' && Math.abs(q.x + q.w / 2 - FX) < 40 && Math.abs(q.y + q.h - RY) < 12);
  const fy = farm ? farm.y + farm.h + 1.5 : RY - 6, fx = farm ? farm.x + farm.w + 4 : FX + 12;
  const up = spline([[fx + 10, fy - 8], [fx + 4, fy - 2], [fx - 2, Math.max(fy, RY - 2.5)], [FX + 6, RY - 1.2], [FX, RY - 0.5]].map(([x, y]) => [x * TILE, y * TILE]), 12);
  const wet = carveWater(m, up, (s) => 13 + s * 5);
  let sy = RY + 2; while (sy < RY + 30 && !(m.tiles[at(FX - 3, sy)] === T.WATER && !m.land[at(FX - 3, sy)])) sy++;
  const down = spline([[FX, RY + 2.5], [FX - 1.2, RY + 4.5], [FX - 2.5, (RY + sy) / 2 + 1.5], [FX - 3.5, sy + 1]].map(([x, y]) => [x * TILE, y * TILE]), 12);
  wet.push(...carveWater(m, down, (s) => 22 + s * 14));
  for (const i of wet) { m.reserve[i] |= RES; }
  if (m.distRiver) for (const i of wet) { m.distRiver[i] = 0; const tx = i % MAP_W, ty = Math.floor(i / MAP_W); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = (ty + dy) * MAP_W + tx + dx; const d = Math.round(Math.hypot(dx, dy) * 4); if (m.distRiver[j] > d || !m.distRiver[j]) m.distRiver[j] = d; } }
  add('coastfall', FX, RY + 2.2, 0, { w: 26, drop: 66, s: 13 });
  for (const [dx, dy, r] of [[-1.6, 2.8, 12], [1.7, 3.2, 10], [-2.4, 5.4, 9]]) add('boulder', FX + dx, RY + dy, r, { s: r * 2 + 4, style: 'basalt', moss: 1 });
  // the beach: sand from the cliff's foot down to the water (a designed beach: drawn as sand, no ground cover)
  for (let tx = X0 - 6; tx <= Math.floor(FX) + 3; tx++) for (let ty = RY + 2; ty < RY + 14; ty++) {
    const i = at(tx, ty), t = m.tiles[i];
    if ((t === T.WATER || t === T.DEEP) && !m.river[i]) break;   // (the sea: the beach ends; the creek: carry on past it)
    if (t === T.DIRT || t === T.GRASS || t === T.SAND) { m.tiles[i] = T.SAND; m.reserve[i] |= RES | 4; }
  }
  // the beach: driftwood logs at the top of the sand
  for (const [dx, dy, len, a] of [[3, 3.4, 110, 0.15], [9, 4.2, 90, -0.3], [14, 3.4, 130, 0.4], [-1, 3.2, 80, -0.1]]) { const tx = X0 + dx, ty = RY + dy; if (m.tiles[at(tx, ty)] === T.SAND) add('driftwood', tx, ty, 0, { len, a }); }
  // tidepools: shallow pools in the sand near the waterline, barnacled basalt round them, life in them
  const LIFE = ['starfish', 'urchin', 'anemone', 'starfish', 'urchin'];
  const pools = [];
  for (let tx = X0 - 4; tx <= X1 + 2; tx += 2) {
    let ty = RY + 4; while (ty < RY + 26 && m.tiles[at(tx, ty)] === T.SAND) ty++;
    if (m.tiles[at(tx, ty)] !== T.WATER && m.tiles[at(tx, ty)] !== T.DEEP) continue;
    const py = ty - 1.5 - hash2(tx, 3, 2601) * 1.5, px = tx + hash2(tx, 4, 2601);
    if (py < RY + 3.2 || m.tiles[at(px, py)] !== T.SAND || hash2(tx, 5, 2601) < 0.15 || pools.some(([qx, qy]) => Math.hypot(qx - px, qy - py) < 3)) continue;
    const rx = 1 + hash2(tx, 6, 2601) * 0.8, ry = 0.7 + hash2(tx, 7, 2601) * 0.5;
    for (let y = Math.floor(py - 2); y <= py + 2; y++) for (let x = Math.floor(px - 2); x <= px + 2; x++) if (((x + 0.5 - px) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2 <= 1 && m.tiles[at(x, y)] === T.SAND) { m.tiles[at(x, y)] = T.WATER; m.reserve[at(x, y)] |= RES; }
    pools.push([px, py, rx, ry]);
  }
  pools.forEach(([px, py, rx, ry], k) => {
    for (let j = 0; j < 3; j++) { const a = j / 3 * Math.PI * 2 + hash2(k, j, 2602), x = px + Math.cos(a) * (rx + 0.7), y = py + Math.sin(a) * (ry + 0.5); if (m.tiles[at(x, y)] === T.SAND) add('boulder', x, y, 12, { s: 16 + Math.round(hash2(k, j, 2603) * 10), style: 'basalt', barn: 1 }); }
    for (let j = 0; j < 3; j++) { const x = px + (hash2(k, j, 2604) - 0.5) * rx, y = py + (hash2(j, k, 2604) - 0.5) * ry; if (m.tiles[at(x, y)] === T.WATER) add(LIFE[(k + j) % LIFE.length], x, y, 0, { v: (k + j) % 4 }); }
    if (k % 2 === 0) add('crab', px + rx + 0.6, py + 0.2, 0, { a: hash2(k, 9, 2605) * 6.28 });
  });
  // the rocks at the waterline: barnacled basalt half in the shallows, starfish, urchins and anemones round them
  for (let tx = X0 - 6; tx <= X1 + 1; tx++) {
    if (hash2(tx, 11, 2607) < 0.45) continue;
    let ty = RY + 2; while (ty < RY + 26 && m.tiles[at(tx, ty)] === T.SAND) ty++;
    const i = at(tx, ty);
    if (m.tiles[i] !== T.WATER || m.land[i]) continue;
    const h = hash2(tx, 12, 2607), x = tx + 0.3 + h * 0.4, y = ty + 0.1 + hash2(tx, 13, 2607) * 0.6;
    add('boulder', x, y, 0, { s: 16 + Math.round(h * 16), style: 'basalt', barn: 1 });
    if (h > 0.4) add(LIFE[Math.floor(h * 10) % LIFE.length], x + 0.6, y + 0.5, 0, { v: tx % 4 });
  }
  // sea stacks out in the surf, kelp-hung, a gull on one
  const stacks = [];
  for (const [dx, dy, r, h] of [[2, 3, 24, 130], [7, 2, 18, 96], [12, 4, 30, 150], [-3, 5, 16, 80]]) {
    const tx = X0 + dx; let ty = RY + 6; while (ty < RY + 40 && m.tiles[at(tx, ty)] !== T.DEEP) ty++;
    ty += dy;
    if (m.tiles[at(tx, ty)] !== T.DEEP) continue;
    add('seastack', tx, ty, r, { s: (tx + ty) % 4 + 1, r, h }); stacks.push([tx, ty]);
  }
  if (stacks.length) add('gull', stacks[0][0] + 0.2, stacks[0][1] - 0.4, 0, { a: 0.5, z: 120 });
  // the cliff top east of the road: pines, beach grass, ice plant; a pull-off by the falls with a bench
  for (const [dx, dy, sp] of [[4, -6, 'fir'], [7, -3, 'pondPine'], [10, -7, 'fir'], [6, -10, 'mtnPine']]) { const tx = FX + dx, ty = RY + dy; if (sandOr(Math.floor(tx), Math.floor(ty)) && !wet.includes(at(tx, ty))) add('tree_a', tx, ty, 12, { sp, k: 1.35 }); }
  for (let k = 0; k < 14; k++) { const tx = X0 - 3 + hash2(k, 1, 2606) * (X1 - X0 + 12), ty = RY + 2.5 + hash2(k, 2, 2606) * 1.2; if (m.tiles[at(tx, ty)] === T.SAND) add('shrub_a', tx, ty, 0, { sp: k % 3 ? 'beachGrass' : 'icePlant', k: 1 }); }
  add('pbench', FX + 7, RY - 3.4, 0, { a: Math.PI });
  add('mapboard', FX + 4.6, RY - 3.2, 10);
  (m.landmarks ||= []).push({ name: 'Driftwood Point', type: 'falls', x: (X0 - 4) * TILE, y: RY * TILE, w: (X1 - X0 + 12) * TILE, h: 16 * TILE });
  m.natureSites.push({ kind: 'coastfalls', name: 'Driftwood Point', x: Math.round(FX * TILE), y: Math.round((RY + 2.2) * TILE), steps: { x: (GX + 1) * TILE, y: (RY + 1) * TILE }, pools: pools.length, stacks: stacks.length });
}

// ---- North Point Courts (North Point; concept G2-B) -------------------------------------------------------------
// The open lawn block in North Point becomes a streetball park: two painted half courts side by side inside a
// chain-link fence, a hoop at the back of each facing the court, aluminium bleachers behind them, benches, lamps
// and bins along the sidewalk, a gate on the south side; plane trees and hedges round the block's edges.
function northPointCourts(m, H) {
  const at = (tx, ty) => ty * MAP_W + tx;
  const blk = (m.blocks || []).find((b) => b.ix === 839 && b.iy === 123 && !b.park);
  if (!blk) return;
  const X0 = blk.ix, Y0 = blk.iy, X1 = blk.ix + blk.iw - 1, Y1 = blk.iy + blk.ih - 1;
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) { const i = at(tx, ty); if (m.tiles[i] !== T.GRASS || m.reserve[i] || m.dist[i] !== 32) return; }
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  m.props.forEach((q, i) => { if (q && q.t !== 'painted' && q.x >= X0 * TILE && q.x < (X1 + 1) * TILE && q.y >= Y0 * TILE && q.y < (Y1 + 1) * TILE) dropProp(m, i); });
  // the fenced court area: centred, 2 x 9 tiles wide, 13 deep (bleachers 3 + courts 9 + a margin)
  const CW = 9, cx0 = X0 + Math.floor((blk.iw - 2 * CW) / 2), cy0 = Y0 + 2, cy1 = Y1 - 1;
  const fx0 = cx0 - 1, fx1 = cx0 + 2 * CW + 1;
  for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) {
    const i = at(tx, ty); m.reserve[i] |= RES | 16;
    if (tx >= fx0 && tx < fx1 && ty >= cy0 && ty < cy1) m.tiles[i] = T.LOT;     // (asphalt under the courts and the bleachers)
  }
  // the courts: painted half courts, the baseline 4 tiles in from the fence's north side; the hoops on it
  const by = cy0 + 3.6, cd = cy1 - by;
  for (let k = 0; k < 2; k++) {
    const ccx = cx0 + k * CW + CW / 2;
    add('court', ccx, by, 0, { w: CW * TILE - 8, d: Math.round(cd * TILE) - 4, c1: k ? '#3a6a5a' : '#3a5a8a', c2: k ? '#8a6a32' : '#9a3a32' });
    add('hoop', ccx, by - 0.1, 8);
    add('bleachers', ccx, cy0 + 1.6, 0, { len: (CW - 2) * TILE, rows: 4 });
    for (let tx = Math.floor(ccx - CW / 2 + 1); tx < ccx + CW / 2 - 1; tx++) m.addSolidProp((tx + 0.5) * TILE, (cy0 + 1.6) * TILE, 12);   // (the bleachers: solid)
  }
  add('trashcan', cx0 + CW, cy0 + 0.8, 5); add('boombox', cx0 + CW + 0.6, cy0 + 2.3, 0);
  // the fence: chain-link all round on the tile lines, solid; the gate in the middle of the south side
  const gx = cx0 + CW;
  for (const [ax, ay, bx, by2] of [[fx0, cy0, fx1, cy0], [fx0, cy0, fx0, cy1], [fx1, cy0, fx1, cy1], [fx0, cy1, gx - 1, cy1], [gx + 1, cy1, fx1, cy1]]) {
    add('chainfence', ax, ay, 0, { tx: (bx - ax) * TILE, ty: (by2 - ay) * TILE });
    const L = Math.hypot(bx - ax, by2 - ay) * TILE;
    for (let d = 0; d <= L; d += 16) m.addSolidProp((ax + (bx - ax) * d / L) * TILE, (ay + (by2 - ay) * d / L) * TILE, 7);
  }
  // round it: a paved walk from the gate to the sidewalk, benches and bins outside the fence, lamps at its corners,
  // plane trees and hedges along the block's edges, a bike rack by the gate
  for (let ty = cy1; ty <= Y1 + 3; ty++) for (const tx of [gx - 1, gx, gx + 1]) { const i = at(tx, ty); if (m.tiles[i] === T.SIDEWALK || m.tiles[i] === T.ROAD) break; m.tiles[i] = T.PLAZA; m.reserve[i] |= RES; }   // (on out to the sidewalk: no street tree in the way)
  for (let ty = Y1 + 1; ty <= Y1 + 2; ty++) for (let tx = gx - 3; tx <= gx + 3; tx++) m.reserve[at(tx, ty)] |= RES;
  for (let tx = fx0; tx <= fx1; tx++) m.tiles[at(tx, cy1)] = m.tiles[at(tx, cy1)] === T.LOT ? T.PLAZA : m.tiles[at(tx, cy1)];
  for (const [tx, ty] of [[fx0 - 0.5, cy0 - 0.5], [fx1 + 0.5, cy0 - 0.5], [fx0 - 0.5, cy1 + 0.5], [fx1 + 0.5, cy1 + 0.5]]) add('lamp', tx, ty);
  for (const tx of [gx - 4.5, gx + 4.5]) add('pbench', tx, cy1 + 0.9, 0, { a: Math.PI });
  add('trashcan', gx - 2.2, cy1 + 0.8, 5); add('bikerack', gx + 2.4, cy1 + 0.9, 6);
  for (let ty = Y0 + 1; ty < Y1; ty += 4) for (const tx of [X0 + 1, X1 - 0.6]) if (tx < fx0 - 1.2 || tx > fx1 + 1.2) add('tree_a', tx, ty + 0.5, 12, { sp: 'street', k: 1.15 });
  for (const [tx, len] of [[X0 + 0.5, fx0 - X0 - 1], [fx1 + 1.5, X1 - fx1 - 1]]) if (len > 1) add('hedgerun', tx, Y1 - 0.4, 0, { tx: len * TILE, ty: 0, h: 14 });
  for (let tx = X0 + 1; tx < X1; tx += 3) if (tx < fx0 - 1 || tx > fx1 + 1) add('shrub_a', tx + 0.5, Y0 + 0.6, 0, { sp: ['hydrangea', 'rose', 'lavender'][tx % 3], k: 1 });
  (m.landmarks ||= []).push({ name: 'North Point Courts', type: 'courts', x: fx0 * TILE, y: cy0 * TILE, w: (fx1 - fx0) * TILE, h: (cy1 - cy0) * TILE });
  m.natureSites.push({ kind: 'courts', name: 'North Point Courts', x: Math.round(gx * TILE), y: Math.round((by + cd / 2) * TILE), gate: { x: gx * TILE + 16, y: cy1 * TILE + 16 }, hoops: [cx0 + CW / 2, cx0 + CW * 1.5].map((x) => ({ x: Math.round(x * TILE), y: Math.round((by - 0.1) * TILE) })) });
}

// ---- Coral Cay's rainforest (concepts N2-A, N2-B, D16) ------------------------------------------------------------
// The island's open middle grows into tropical rainforest: groves of palms and big-leaved trees with clearings,
// a jungle floor of ferns, monstera, elephant ears and birds of paradise (statics.js coverAt, reserve bit 64); a
// waterfall drops off a mossy basalt ledge into a pool in the middle of it, with a trail in from the nearest road.
function coralRainforest(m, H) {
  const D = 44, JUNGLE = 64;
  const ok = (i) => m.dist[i] === D && m.tiles[i] === T.GRASS && !m.reserve[i];
  // the jungle floor: open grass two tiles clear of roads, buildings and pavement, four clear of the sand
  const floor = [];
  let sx = 0, sy = 0;
  for (let ty = 990; ty < 1150; ty++) for (let tx = 1030; tx < 1205; tx++) {
    const i = ty * MAP_W + tx;
    if (!ok(i)) continue;
    let clear = true;
    for (let dy = -4; dy <= 4 && clear; dy++) for (let dx = -4; dx <= 4; dx++) {
      const t = m.tiles[(ty + dy) * MAP_W + tx + dx], d2 = dx * dx + dy * dy;
      if (((t === T.ROAD || t === T.SIDEWALK || t === T.BUILDING || t === T.PLAZA || t === T.LOT || t === T.WALL) && d2 <= 5) || ((t === T.SAND || t === T.WATER || t === T.DEEP) && d2 <= 16)) { clear = false; break; }
    }
    if (!clear) continue;
    m.reserve[i] |= JUNGLE; floor.push(i); sx += tx; sy += ty;
  }
  if (floor.length < 200) return;
  // the falls: in the middle of the biggest clear patch (the jungle tile with the most jungle round it)
  let F = null, bestN = -1;
  for (let k = 0; k < floor.length; k += 3) {
    const i = floor[k], tx = i % MAP_W, ty = Math.floor(i / MAP_W);
    let c = 0; for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) if (m.reserve[(ty + dy) * MAP_W + tx + dx] & JUNGLE) c++;
    if (c > bestN) { bestN = c; F = [tx, ty]; }
  }
  const fx = (F[0] + 0.5) * TILE, fy = F[1] * TILE;
  // the ledge (solid) with the pool below it
  for (let dx = -60; dx <= 60; dx += 14) m.addSolidProp(fx + dx, fy - 6, 10);
  const pool = [];
  for (let ty = F[1]; ty <= F[1] + 4; ty++) for (let tx = F[0] - 4; tx <= F[0] + 4; tx++) {
    const dx = (tx - F[0]) / 4.3, dy = (ty - F[1] - 2) / 2.6;
    if (dx * dx + dy * dy > 1) continue;
    const i = ty * MAP_W + tx; m.tiles[i] = T.WATER; m.lake[i] = 1; m.reserve[i] |= RES; pool.push(i);
  }
  for (let ty = F[1] - 3; ty <= F[1] + 7; ty++) for (let tx = F[0] - 7; tx <= F[0] + 7; tx++) m.reserve[ty * MAP_W + tx] |= RES;
  for (const [dx, dy, r] of [[-100, 40, 16], [104, 50, 14], [-60, 120, 13], [70, 126, 15], [-130, -10, 18], [134, -6, 16]]) H.addProp(m, 'boulder', fx + dx, fy + dy, r, { s: r * 2 + 6, style: 'basalt', moss: 1 });
  // a mossy log with mushrooms by the pool, ferns round it
  H.addProp(m, 'log', fx - 150, fy + 90, 0, { a: 0.4, len: 110, moss: 1 });
  for (const [dx, dy] of [[-40, 150], [40, 150], [-170, 60], [170, 70]]) H.addProp(m, 'shrub_a', fx + dx, fy + dy, 0, { sp: 'fern', k: 1.2 });
  // the trail in: from the falls to the nearest road
  let best = null;
  for (let r = 4; r < 40 && !best; r++) for (let a = 0; a < 24; a++) { const tx = Math.round(F[0] + Math.cos(a / 24 * 6.283) * r), ty = Math.round(F[1] + 6 + Math.sin(a / 24 * 6.283) * r); if (m.tiles[ty * MAP_W + tx] === T.ROAD) { best = [tx, ty]; break; } }
  if (best) {
    const tr = spline([[fx, fy + 170], [(fx + (best[0] + 0.5) * TILE) / 2 + 40, (fy + 170 + (best[1] + 0.5) * TILE) / 2], [(best[0] + 0.5) * TILE, (best[1] + 0.5) * TILE]], 16);
    for (const [x, y] of tr) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = at(x + dx * 12, y + dy * 12); if (m.tiles[i] === T.GRASS && m.dist[i] === D) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
  }
  // the trees: groves of palms and broad-leaved trees, clearings between (a 2-tile jittered grid)
  for (let k = 0; k < floor.length; k++) {
    const i = floor[k], tx = i % MAP_W, ty = Math.floor(i / MAP_W);
    if ((tx & 1) || (ty & 1) || (m.reserve[i] & RES)) continue;
    const g = 0.6 * vnoise2(tx, ty, 9, 971) + 0.4 * vnoise2(tx, ty, 4, 972), h = hash2(tx, ty, 973);
    if (h >= smooth01(0.38, 0.62, g) * 0.7) continue;
    const x = (tx + 0.5 + (hash2(tx, ty, 974) - 0.5)) * TILE, y = (ty + 0.5 + (hash2(tx, ty, 975) - 0.5)) * TILE;
    const v = hash2(tx, ty, 976), sp = v < 0.35 ? 'coconut' : v < 0.5 ? 'royal' : v < 0.68 ? 'banana' : v < 0.82 ? 'fanSkirt' : 'leaning';
    H.addProp(m, 'palm_a', x, y, sp === 'banana' ? 0 : 10, { sp, k: sp === 'banana' ? 1.2 : 1.3 + hash2(tx, ty, 977) * 0.3 });
  }
  (m.landmarks ||= []).push({ name: 'Coral Cay Falls', type: 'falls', x: Math.round(fx - 240), y: Math.round(fy - 140), w: 480, h: 360 });
  m.natureSites.push({ kind: 'rainforest', name: 'Coral Cay Rainforest', x: Math.round(sx / floor.length * TILE), y: Math.round(sy / floor.length * TILE), falls: { x: Math.round(fx), y: Math.round(fy), w: 60, drop: 36 }, floor: floor.length });
}
// value noise over tiles (s: feature size in tiles), 0..1 (the same as map.js vnoise2)
function vnoise2(x, y, s, seed) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const smooth01 = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- along the country roads: something every 70-110 m (docs/WORLD-V2.md: "no stretch of a route goes much more
// than about 100 m without a feature"). Small composed bits by the verge, alternating sides, by biome: a road sign,
// a mailbox at a farm gate with a fence run, a fruit stand, hay bales, a lay-by with a bench and a bin, a picnic
// table under a tree, a trail sign and map board, a log pile, a rock cairn, a viewpoint with coin binoculars.
// Nothing solid within two tiles of the road (signs and boxes are small and walk-through).
function roadside(m, H) {
  const country = (i) => { const st = (m._distStyle && m._distStyle[m.dist[i]]) || ''; return st === 'wild' || st === 'rural' || st === 'desert'; };
  const placed = [];
  const clearAt = (x, y, r) => {
    for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
      const i = ty * MAP_W + tx, t = m.tiles[i];
      if (m.reserve[i] || (t !== T.GRASS && t !== T.DIRT && t !== T.SAND)) return false;
    }
    return placed.every(([px, py]) => Math.hypot(px - x, py - y) > 900);
  };
  const BIO = (x, y) => (m.terrainCls ? m.terrainCls.at(Math.floor(x / TILE), Math.floor(y / TILE)) : 1);
  let n = 0;
  for (const r of m.roads || []) {
    if ((r.kind !== 'rural' && r.kind !== 'dirt') || !r.pts || r.pts.length < 2) continue;
    const pts = r.pts, segs = [];
    let L = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push([L, l]); L += l; }
    const at = (s) => { let k = 0; while (k < segs.length - 1 && segs[k][0] + segs[k][1] < s) k++; const [s0, l] = segs[k], t = l ? (s - s0) / l : 0, a = pts[k], b = pts[k + 1]; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / (l || 1), dy: (b.y - a.y) / (l || 1) }; };
    const hw = r.hw || 48;
    for (let s = 500 + hash2(r.id || n, 1, 960) * 900; s < L - 300; s += 1700 + hash2(Math.round(s), r.id || 0, 961) * 900) {
      // a spot: this side or the other, here or a little either way along the road
      let q = null, x = 0, y = 0, i = 0, nx = 0, ny = 0, found = false;
      const side0 = hash2(Math.round(s), 2, 962) < 0.5 ? -1 : 1;
      for (const ds of [0, 220, -220, 440]) for (const side of [side0, -side0]) {
        if (found || s + ds < 200 || s + ds > L - 200) continue;
        q = at(s + ds); nx = -q.dy * side; ny = q.dx * side;
        x = q.x + nx * (hw + 96); y = q.y + ny * (hw + 96); i = Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE);
        if (country(i) && clearAt(x, y, 30)) found = true;
      }
      if (!found) continue;
      placed.push([x, y]); n++;
      const bio = BIO(x, y), st = m._distStyle[m.dist[i]], u = hash2(Math.round(x), Math.round(y), 963), a = Math.atan2(q.dy, q.dx);
      const ax = x + nx * 40, ay = y + ny * 40;   // a little further from the road (for anything solid-ish)
      if (u < 0.16) H.addProp(m, 'roadsign', x, y, 0, { k: hash2(n, 3, 964) < 0.5 ? 'curve' : 'arrow', a });
      else if (st === 'rural' && u < 0.45) {   // farmland: a mailbox at a gate with a fence run, or a fruit stand, or hay
        const v = hash2(n, 4, 965);
        if (v < 0.4) {
          H.addProp(m, 'mailbox', x, y, 0);
          H.addProp(m, 'rail', x + q.dx * 40, y + q.dy * 40, 0, { tx: Math.round(q.dx * 220), ty: Math.round(q.dy * 220) });
          H.addProp(m, 'rail', x - q.dx * 40, y - q.dy * 40, 0, { tx: Math.round(-q.dx * 220), ty: Math.round(-q.dy * 220) });
        } else if (v < 0.7) { H.addProp(m, 'stand', x, y, 0); H.addProp(m, 'flowers_a', x + q.dx * 50, y + q.dy * 50, 0, { sp: 'sunflowers', k: 1 }); }
        else for (let k = 0; k < 3; k++) H.addProp(m, 'hayBale', ax + q.dx * (k - 1) * 30, ay + q.dy * (k - 1) * 30, 0);
      } else if (u < 0.62) {   // a lay-by: gravel, a bench and a bin
        for (let k = -2; k <= 2; k++) { const j = Math.floor((y + q.dy * k * 28) / TILE) * MAP_W + Math.floor((x + q.dx * k * 28) / TILE); if (m.tiles[j] === T.GRASS) m.tiles[j] = T.DIRT; }
        H.addProp(m, 'pbench', ax, ay, 0);
        H.addProp(m, 'trashcan', ax + q.dx * 40, ay + q.dy * 40, 0);
      } else if (u < 0.74) {   // a picnic table under a tree
        H.addProp(m, 'picnic', ax, ay, 0);
        H.addProp(m, 'tree_a', ax + nx * 80, ay + ny * 80 - 10, 12, { g: bio === 2 ? 1 : 2 });
      } else if (u < 0.84 && (bio === 2 || st === 'wild')) {   // a trailhead: the sign, a map board, a log pile
        H.addProp(m, 'fingerpost', x, y, 0); H.addProp(m, 'mapboard', ax, ay, 0); H.addProp(m, 'lumber', ax + q.dx * 60, ay + q.dy * 60, 0);
      } else if (u < 0.92 && (bio === 4 || bio === 3)) {   // a cairn of stones; in the hills, coin binoculars too
        H.addProp(m, 'boulder', ax + nx * 30, ay + ny * 30, 12, { s: 28 });
        if (bio === 4) H.addProp(m, 'scope', ax, ay, 0);
      } else H.addProp(m, 'roadsign', x, y, 0, { k: 'arrow', a });
    }
  }
  Object.defineProperty(m, 'roadsideN', { value: n, enumerable: false, configurable: true });
}

// ---- the farms (concept D13): a fenced pasture with a windmill and trough beside each farmstead, sunflowers
// along the farm's fences, a mailbox at the road (the livestock graze round the farms: wildlife.js) ---------------
function farmDressing(m, H) {
  const ok = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !m.reserve[i];
  for (const poi of m.pois.filter((p) => p.kind === 'farm')) {
    const ftx = Math.floor(poi.x / TILE), fty = Math.floor(poi.y / TILE);
    // the pasture: the nearest clear 12 x 9 tiles within 30 tiles of the farm
    let best = null;
    for (let ty = fty - 30; ty <= fty + 30; ty += 2) for (let tx = ftx - 34; tx <= ftx + 30; tx += 2) {
      let good = true;
      for (let y = ty - 1; y <= ty + 10 && good; y++) for (let x = tx - 1; x <= tx + 13; x++) if (!ok(y * MAP_W + x)) { good = false; break; }
      if (!good) continue;
      const d = Math.hypot(tx + 6 - ftx, ty + 4.5 - fty);
      if (!best || d < best.d) best = { tx, ty, d };
    }
    if (!best) continue;
    const x0 = best.tx * TILE, y0 = best.ty * TILE, w = 12 * TILE, h = 9 * TILE;
    for (let y = best.ty; y < best.ty + 9; y++) for (let x = best.tx; x < best.tx + 12; x++) { const i = y * MAP_W + x; m.reserve[i] |= RES; m.tiles[i] = T.GRASS; }   // (grazed grass)
    // anything already standing in it goes (the pasture is open grass)
    // (and a band south of it: a tree there would stand up over the pasture in this view)
    m.props.forEach((p, i) => { if (p && p.x > x0 - 8 && p.x < x0 + w + 8 && p.y > y0 - 8 && p.y < y0 + h + 120 && p.t !== 'painted') dropProp(m, i); });
    for (let y = best.ty + 9; y < best.ty + 13; y++) for (let x = best.tx; x < best.tx + 12; x++) m.reserve[y * MAP_W + x] |= RES;
    // the fence: four sides (a gap in the south side for the gate), solid along its length
    const runs = [[x0, y0, x0 + w, y0], [x0, y0, x0, y0 + h], [x0 + w, y0, x0 + w, y0 + h], [x0, y0 + h, x0 + w * 0.42, y0 + h], [x0 + w * 0.58, y0 + h, x0 + w, y0 + h]];
    for (const [ax, ay, bx, by] of runs) {
      H.addProp(m, 'rail', ax, ay, 0, { tx: bx - ax, ty: by - ay });
      const L = Math.hypot(bx - ax, by - ay);
      for (let k = 0; k <= L; k += 16) m.addSolidProp(ax + (bx - ax) * k / L, ay + (by - ay) * k / L, 7);
    }
    H.addProp(m, 'windmill', x0 + w - 40, y0 + 46, 18);
    H.addProp(m, 'trough', x0 + w - 90, y0 + 60, 10);
    for (let k = 0; k < 3; k++) H.addProp(m, 'hayBale', x0 + 40 + k * 30, y0 + 40, 10);
    // sunflowers along the outside of the pasture's south fence
    for (let x = x0 + 16; x < x0 + w - 8; x += 26) if (Math.abs(x - (x0 + w / 2)) > w * 0.1) H.addProp(m, 'flowers_a', x, y0 + h + 22, 0, { sp: 'sunflowers', k: 1 });
    m.natureSites.push({ kind: 'pasture', name: `${poi.label} Pasture`, x: Math.round(x0 + w / 2), y: Math.round(y0 + h / 2) });
  }
}

// ---- the Stadium Lido (Westport Stadium park; concept L1) -----------------------------------------------------
// An outdoor public pool in the park's north-east lawn, behind a chain-link fence with hedges outside it: the
// changing block along the north side (its kiosk window and changing-room doors to the deck), a four-lane pool
// with a deep diving end and a springboard, lane ropes, a lifeguard tower, a round hot tub, loungers and striped
// umbrellas on the pale deck, cafe tables by the kiosk, potted palms; the gate on the south side to the park's
// cross path, a bike rack and a bench outside it.
function stadiumLido(m, H) {
  const park = (m.blocks || []).find((b) => b.park && b.park.label === 'Westport Stadium');
  if (!park) return;
  const { ix, iy, iw, ih } = park, cx = ix + Math.floor(iw / 2), cy = iy + Math.floor(ih / 2);
  // the north-east lawn: the grass round a seed point, bounded by the paths
  const seen = new Set(), st = [[cx + 12, cy - 8]];
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  while (st.length) {
    const [tx, ty] = st.pop(), i = ty * MAP_W + tx;
    if (seen.has(i) || tx < ix || ty < iy || tx >= ix + iw || ty >= iy + ih || m.tiles[i] !== T.GRASS) continue;
    seen.add(i); x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty);
    st.push([tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]);
  }
  // (the columns that are lawn all the way down: the fountain plaza bites the lawn's south-west corner)
  const col = (tx) => { for (let ty = y0; ty <= y1; ty++) if (!seen.has(ty * MAP_W + tx)) return false; return true; };
  while (x0 < x1 && !col(x0)) x0++;
  while (x1 > x0 && !col(x1)) x1--;
  const W = x1 - x0 + 1, Hh = y1 - y0 + 1;
  if (W < 24 || Hh < 12) return;
  const add = (t, tx, ty, r = 0, extra = null) => H.addProp(m, t, Math.round(tx * TILE), Math.round(ty * TILE), r, extra);
  // what the park put there goes (its trees, beds and benches)
  m.props.forEach((p, i) => { if (p && p.t !== 'painted' && p.x >= x0 * TILE && p.x < (x1 + 1) * TILE && p.y >= y0 * TILE && p.y < (y1 + 1) * TILE) dropProp(m, i); });
  // inside the fence (a tile in from the lawn's edge all round): the deck
  const fx0 = x0, fy0 = y0 + 1, fx1 = x1, fy1 = y1;             // (fence on the tile lines x0, x1, y0+1, y1: a lawn strip outside it to the east and north, one south)
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const i = ty * MAP_W + tx; m.reserve[i] |= RES; if (tx >= fx0 && tx < fx1 && ty >= fy0 && ty < fy1) m.tiles[i] = T.PLAZA; }
  // the changing block along the north side: solid
  const bw = Math.min(10, Math.floor((fx1 - fx0) * 0.42)), bx0 = fx0 + 1, by0 = fy0, bd = 2;
  for (let ty = by0; ty < by0 + bd; ty++) for (let tx = bx0; tx < bx0 + bw; tx++) m.tiles[ty * MAP_W + tx] = T.WALL;
  add('poolhouse', bx0 + bw / 2, by0 + bd / 2 - 0.25, 0, { w: bw * TILE, d: bd * TILE - 4 });
  // the pool: four lanes along x, the deep end at the east with the springboard; water you can swim in
  const px0 = fx0 + 2, py0 = by0 + bd + 2, pw = Math.min(20, fx1 - fx0 - 8), ph = 6, dw = 5;
  for (let ty = py0; ty < py0 + ph; ty++) for (let tx = px0; tx < px0 + pw; tx++) { const i = ty * MAP_W + tx; m.tiles[i] = tx >= px0 + pw - dw ? T.DEEP : T.WATER; }
  const pool = { x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 4, deep: { x: (px0 + pw - dw) * TILE, y: py0 * TILE, w: dw * TILE, h: ph * TILE }, deck: { x: fx0 * TILE, y: fy0 * TILE, w: (fx1 - fx0) * TILE, h: (fy1 - fy0) * TILE } };
  (m.pools ||= []).push(pool);
  const lx = px0 + (pw - dw) / 2;
  for (let k = 1; k < 4; k++) add('lanerope', lx, py0 + ph * k / 4, 0, { len: (pw - dw) * TILE - 8 });
  add('lanerope', px0 + pw - dw, py0 + ph / 2, 0, { len: ph * TILE - 8, a: Math.PI / 2 });          // (the rope across the deep end's line)
  add('diveboard', px0 + pw + 0.9, py0 + ph / 2, 10, { a: Math.PI, len: 64 });
  add('lguard', px0 - 1.2, py0 + ph - 1, 14, { a: 0 });
  // the deck: loungers and umbrellas along the north side, the hot tub in the north-east corner, cafe tables by
  // the kiosk, loungers along the south side too, potted palms at the corners
  const ly = py0 - 1.1;
  let k = 0;
  for (let x = bx0 + bw + 1.2; x < fx1 - 4.5; x += 1.5, k++) { if (k % 3 === 2) add(k % 2 ? 'umbrella_b' : 'umbrella_r', x, ly - 0.2, 4); else add('lounger', x, ly, 6, { a: Math.PI / 2, v: k % 4 }); }
  add('hottub', fx1 - 2.3, by0 + 1.9, 26, { r: 30 });
  for (let x = px0 + 1.5, j = 0; x < px0 + pw - dw - 1; x += 1.6, j++) { if (j % 3 === 1) add(j % 2 ? 'umbrella_r' : 'umbrella_b', x, py0 + ph + 1.1, 4); else add('lounger', x, py0 + ph + 0.95, 6, { a: -Math.PI / 2, v: (j + 2) % 4 }); }
  for (const [dx, dy] of [[0.9, 0.6], [2.6, 0.9]]) { add('cafetable', bx0 + dx, by0 + bd + dy, 6); }
  add('umbrella_g', bx0 + 1.7, by0 + bd + 0.6, 4);
  for (const [tx, ty] of [[fx0 + 0.6, fy1 - 0.7], [fx1 - 0.6, fy1 - 0.7], [fx0 + 0.6, py0 - 0.6]]) add('potted', tx, ty, 6);
  add('chalkboard', bx0 + bw * 0.3, by0 + bd + 0.35, 0);
  // the fence: chain-link all round on the tile lines, the gate in the south side (solid either side of it)
  const gx = Math.round((fx0 + fx1) / 2);
  const runs = [[fx0, fy0, fx1, fy0], [fx0, fy0, fx0, fy1], [fx1, fy0, fx1, fy1], [fx0, fy1, gx - 1, fy1], [gx + 1, fy1, fx1, fy1]];
  for (const [ax, ay, bx, by] of runs) {
    add('chainfence', ax, ay, 0, { tx: (bx - ax) * TILE, ty: (by - ay) * TILE });
    const L = Math.hypot(bx - ax, by - ay) * TILE;
    for (let d = 0; d <= L; d += 16) m.addSolidProp((ax + (bx - ax) * d / L) * TILE, (ay + (by - ay) * d / L) * TILE, 7);
  }
  // outside: hedges along the east and west fences, trees at the corners, the bike rack and a bench by the gate
  add('hedgerun', fx0 - 0.55, fy0 + 0.5, 0, { tx: 0, ty: (fy1 - fy0 - 1) * TILE });
  add('hedgerun', fx1 + 0.5, fy0 + 0.5, 0, { tx: 0, ty: (fy1 - fy0 - 1) * TILE });
  add('bikerack', gx - 2.6, fy1 + 0.55, 6); add('bench_m', gx + 2.8, fy1 + 0.55, 6); add('trashcan', gx + 1.6, fy1 + 0.5, 5);
  for (const [tx, ty, sp] of [[x0 + 0.4, y0 + 0.4, 'oak'], [x1 + 0.6, y0 + 0.4, 'maple'], [x1 + 0.6, y1 + 0.6, 'oak']]) add('tree_a', tx, ty, 12, { sp, k: 1.3 });
  (m.landmarks ||= []).push({ name: 'Stadium Lido', type: 'pool', x: fx0 * TILE, y: fy0 * TILE, w: (fx1 - fx0) * TILE, h: (fy1 - fy0) * TILE });
  m.natureSites.push({ kind: 'pool', name: 'Stadium Lido', x: Math.round((px0 + pw / 2) * TILE), y: Math.round((py0 + ph / 2) * TILE), gate: { x: gx * TILE, y: fy1 * TILE }, house: { x: Math.round((bx0 + bw / 2) * TILE), y: Math.round((by0 + bd) * TILE) } });
}

// ---- the Old Granite Mine (Granite Peaks; concept N3, the mine's mouth) -----------------------------------------
// A granite cliff band with a timbered adit in its south face; rails run out of it past an ore cart, lanterns on
// posts either side, crates, barrels and tools by the mouth, glowing crystals in the rock, tailings heaps; a dirt
// track down to the nearest road.
function oldMine(m, H) {
  const ok = (i) => (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !m.reserve[i] && m.dist[i] === 33;
  let best = null;
  for (let ty = 30; ty < 200; ty += 2) for (let tx = 470; tx < 720; tx += 2) {
    let good = true;
    for (let dy = -6; dy <= 8 && good; dy++) for (let dx = -9; dx <= 9; dx++) if (!ok((ty + dy) * MAP_W + tx + dx)) { good = false; break; }
    if (!good) continue;
    let road = 0;
    for (let k = 9; k <= 20 && !road; k++) for (let dx = -4; dx <= 4; dx++) { const t = m.tiles[(ty + k) * MAP_W + tx + dx]; if (t === T.ROAD) { road = k; break; } }
    if (!road) continue;
    const d = Math.hypot(tx * TILE - 17200, ty * TILE - 3400) + road * 20;
    if (!best || d < best.d) best = { tx, ty, road, d };
  }
  if (!best) return;
  const { tx, ty, road } = best;
  // the cliff band: solid rock over its footprint
  for (let y = ty - 5; y <= ty; y++) for (let x = tx - 7; x <= tx + 7; x++) { const i = y * MAP_W + x; m.tiles[i] = T.WALL; m.reserve[i] |= RES; }
  for (let y = ty - 7; y <= ty + 8; y++) for (let x = tx - 10; x <= tx + 10; x++) m.reserve[y * MAP_W + x] |= RES;
  const X = (tx + 0.5) * TILE, face = (ty + 1) * TILE;
  H.addProp(m, 'cliff', X, face, 0, { w: 15 * TILE, d: 6 * TILE, h: 120, s: 33 });
  H.addProp(m, 'mineportal', X, face + 10, 0);
  // the rails out of the mouth, the cart on them, dirt under it all and down to the road
  for (let y = ty + 1; y <= ty + road; y++) for (let x = tx - 1; x <= tx + 1; x++) { const i = y * MAP_W + x; if (m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT; }
  for (let y = ty + 1; y <= ty + 6; y++) for (let x = tx - 5; x <= tx + 5; x++) { const i = y * MAP_W + x; if (m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT; }
  H.addProp(m, 'rails', X, face + 4 * TILE, 0, { len: 7 * TILE });
  H.addProp(m, 'minecart', X, face + 3.2 * TILE, 12);
  for (const sx of [-1, 1]) { H.addProp(m, 'lantern', X + sx * 58, face + 22, 4); }
  for (const [dx, dy, t, r] of [[-110, 40, 'crates', 12], [-88, 76, 'barrel', 8], [-128, 84, 'barrel', 8], [104, 50, 'chest', 10], [124, 90, 'pickaxe', 0], [86, 96, 'lumber', 10]]) H.addProp(m, t, X + dx, face + dy, r);
  for (const [dx, dy, size] of [[-150, 14, 30], [150, 18, 26], [-74, 12, 18]]) H.addProp(m, 'crystal', X + dx, face + dy, 0, { size });
  for (const [dx, dy, r] of [[-250, -40, 30], [256, -30, 26]]) H.addProp(m, 'outcrop', X + dx, face + dy, r, { w: 100, d: 64, h: 70, s: dx > 0 ? 5 : 6, style: 'granite' });
  for (const [dx, dy] of [[-200, 150], [180, 140]]) H.addProp(m, 'gravel', X + dx, face + dy, 0);
  (m.landmarks ||= []).push({ name: 'Old Granite Mine', type: 'mine', x: Math.round(X - 260), y: Math.round(face - 220), w: 520, h: 420 });
  m.natureSites.push({ kind: 'mine', name: 'Old Granite Mine', x: Math.round(X), y: Math.round(face) });
}

// clear a map prop away (its picture and its solid footprint): for a designed place that replaces random dressing
function dropProp(m, i) {
  const p = m.props[i];
  if (!p) return;
  const e = m.propSolid && m.propSolid.get(i);
  if (e) {
    for (const arr of m.solidProps.values()) { const k = arr.indexOf(e); if (k >= 0) { arr.splice(k, 1); break; } }
    m.propSolid.delete(i);
  }
  m.props[i] = { t: 'painted', x: p.x, y: p.y };   // (kept in place: other props keep their indices)
}

// ---- Northshore Botanical Gardens (concept N6) ----------------------------------------------------------------------
// Northshore Commons, laid out as the gardens: the Japanese garden round the pond (a red bridge, stone lanterns, a
// little waterfall, maples, raked gravel, koi), the glasshouse and the orchard, the kitchen garden (raised beds,
// sunflowers, a scarecrow, the potting shed), the lavender and the beehives, roses round the fountain and a statue.
function northshoreGardens(m, H) {
  const park = (m.blocks || []).find((b) => b.park && b.park.label === 'Northshore Commons');
  if (!park) return;
  const { ix, iy, iw, ih } = park, cx = ix + Math.floor(iw / 2), cy = iy + Math.floor(ih / 2);
  const P = (tx, ty) => [(tx + 0.5) * TILE, (ty + 0.5) * TILE];
  // the park's random trees, shrubs, flowers and mosaics give way (lamps, benches and the fountain stay)
  const RANDOM = new Set(['tree_a', 'tree_b', 'shrub_a', 'flowers_a', 'flowers_big', 'mosaic']);
  m.props.forEach((p, i) => { if (p && RANDOM.has(p.t) && p.x >= ix * TILE && p.x < (ix + iw) * TILE && p.y >= iy * TILE && p.y < (iy + ih) * TILE) dropProp(m, i); });
  for (let ty = iy; ty < iy + ih; ty++) for (let tx = ix; tx < ix + iw; tx++) m.reserve[ty * MAP_W + tx] |= RES;
  const q = { x0: ix + 6, x1: cx - 2, y0: iy + 6, y1: cy - 2 };          // the north-west quarter inside the ring path
  const E = { x0: cx + 2, x1: ix + iw - 6, y0: iy + 6, y1: cy - 2 };     // north-east (the pond)
  const S = { x0: ix + 6, x1: cx - 2, y0: cy + 3, y1: iy + ih - 6 };     // south-west
  const T2 = { x0: cx + 2, x1: ix + iw - 6, y0: cy + 3, y1: iy + ih - 6 }; // south-east
  const add = (t, tx, ty, r = 0, extra = null) => { const [x, y] = P(tx, ty); H.addProp(m, t, x, y, r, extra); };
  // NW: the glasshouse along the north, the orchard in rows below it with ladders and fruit crates
  add('greenhouse', (q.x0 + q.x1) / 2, q.y0 + 2.2, 0);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -5; dx <= 5; dx++) m.addSolidProp(((q.x0 + q.x1) / 2 + dx * 0.45 + 0.5) * TILE, (q.y0 + 1.6 + dy * 0.8) * TILE, 10);
  let k = 0;
  for (let ty = q.y0 + 6; ty <= q.y1 - 1; ty += 3) for (let tx = q.x0 + 1; tx <= q.x1 - 1; tx += 3, k++) add('tree_a', tx, ty, 10, { sp: k % 3 === 2 ? 'orange' : 'apple', k: 1.2 });
  add('ladder', q.x0 + 2.6, q.y0 + 6.4, 0); add('fruitcrate', q.x0 + 4.4, q.y0 + 8.2, 0); add('fruitcrate', q.x0 + 4.9, q.y0 + 8.4, 0);
  // NE: the Japanese garden round the pond
  const pondT = []; for (let ty = E.y0; ty <= E.y1; ty++) for (let tx = E.x0; tx <= E.x1; tx++) { const t = m.tiles[ty * MAP_W + tx]; if (t === T.WATER || t === T.DEEP) pondT.push([tx, ty]); }
  if (pondT.length) {
    const px = pondT.reduce((a, p) => a + p[0], 0) / pondT.length, py = pondT.reduce((a, p) => a + p[1], 0) / pondT.length;
    // the red bridge across the pond's narrow middle (planks underneath: you can walk it)
    for (let tx = Math.floor(px) - 5; tx <= Math.floor(px) + 5; tx++) { const i = Math.round(py) * MAP_W + tx; if (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) m.tiles[i] = T.DOCK; }
    add('redbridge', px, Math.round(py), 0, { len: 11 * TILE });
    for (const [dx, dy] of [[-6.5, -3], [6.5, 3.5], [-5, 4], [4.5, -4.5]]) add('stonelantern', px + dx, py + dy, 6);
    add('fallsmall', px + 3, py - 5.6, 0);
    for (const [dx, dy] of [[-7.5, -5], [7.5, -4], [-7, 5.5]]) add('tree_a', px + dx, py + dy, 10, { sp: 'redMaple', k: 1.25 });
    add('tree_a', px + 7.5, py + 6, 10, { sp: 'cherry', k: 1.3 });
    for (let j = 0; j < 6; j++) add('koi', px - 3 + (j % 3) * 2.6, py - 2 + Math.floor(j / 3) * 3.4, 0, { v: j % 4, a: j * 1.1 });
    for (let j = 0; j < 3; j++) add('lily', px - 4 + j * 4, py + 2.5 - (j % 2) * 4, 0, { v: j });
  }
  add('gravelgarden', E.x1 - 3, E.y1 - 1.5, 0);
  // the centre: roses round the fountain plaza, the statue north of it
  for (const [dx, dy] of [[-6, -5.5], [6, -5.5], [-6, 5.5], [6, 5.5], [-3, -6], [3, -6], [-3, 6], [3, 6]]) add('shrub_a', cx + dx, cy + dy, 0, { sp: 'rose', k: 1.1 });
  add('statue', cx, cy - 7.2, 8);
  // SW: the kitchen garden: raised beds in rows, sunflowers along the back, the scarecrow, the potting shed
  for (let ty = S.y0 + 3; ty <= S.y1 - 2; ty += 3) for (let tx = S.x0 + 2; tx <= S.x1 - 3; tx += 4) add('raisedbed', tx + 1, ty, 0, { v: (tx + ty) % 4 });
  for (let tx = S.x0 + 1; tx <= S.x1 - 1; tx += 1.5) add('shrub_a', tx, S.y0 + 0.8, 0, { sp: 'sunflowers', k: 1 });
  add('scarecrow', (S.x0 + S.x1) / 2, S.y0 + 4.6, 0);
  add('shed', S.x0 + 1.2, S.y1 - 0.8, 0);
  for (let dx = -1; dx <= 1; dx++) m.addSolidProp((S.x0 + 1.7 + dx * 0.5) * TILE, (S.y1 - 1.1) * TILE, 10);
  add('wheelbarrow', S.x0 + 3.6, S.y1 - 0.6, 0);
  // SE: lavender in rows, the beehives along the east
  for (let ty = T2.y0 + 1; ty <= T2.y1 - 1; ty += 2) for (let tx = T2.x0 + 1; tx <= T2.x1 - 5; tx += 1.4) add('shrub_a', tx, ty, 0, { sp: 'lavender', k: 1 });
  for (let j = 0; j < 5; j++) add('beehive', T2.x1 - 2, T2.y0 + 2 + j * 2.4, 6, { v: j % 3 });
  (m.landmarks ||= []).push({ name: 'Northshore Botanical Gardens', type: 'gardens', x: ix * TILE, y: iy * TILE, w: iw * TILE, h: ih * TILE });
  m.natureSites.push({ kind: 'gardens', name: 'Northshore Botanical Gardens', x: cx * TILE, y: cy * TILE });
}

// ---- Heron Marsh (Lake District; concepts N7, NK1-O) --------------------------------------------------------------
// Heron Lake's east side opens into a marsh: channels of still water between reed islands, lily pads, a boardwalk
// with rails across it; a beaver dam where the lake spills out to the south with the lodge beside it; a fishing
// pier with a lantern on the west shore, a canoe on the bank; willows round the edges; herons, swans and ducks.
function heronMarsh(m, H) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (let ty = 970; ty < 1030; ty++) for (let tx = 660; tx < 710; tx++) if (m.lake[ty * MAP_W + tx]) { n++; x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
  if (n < 100) return;
  const cyL = (y0 + y1) / 2, open = (i) => m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT;
  const setWater = (i) => { m.tiles[i] = T.WATER; m.lake[i] = 1; m.reserve[i] |= RES; };
  // the marsh: east of the lake, channels where a noise is low, reed islands between
  const marsh = [];
  for (let ty = y0 + 2; ty <= y1 - 2; ty++) for (let tx = x1 - 3; tx <= x1 + 13; tx++) {
    const i = ty * MAP_W + tx;
    if (!open(i) || m.reserve[i]) continue;
    const e = (tx - x1) / 13, v = 0.55 * hash2(tx >> 1, ty >> 1, 941) + 0.45 * hash2(tx >> 2, ty >> 2, 942);
    if (v < 0.62 - e * 0.25) { setWater(i); marsh.push(i); } else m.reserve[i] |= RES;
  }
  // the outflow: from the lake's south tip, a creek south-east, the beaver dam across its mouth
  let sx = 0, sy = 0;
  for (let tx = x0; tx <= x1; tx++) for (let ty = y1; ty >= y0; ty--) if (m.lake[ty * MAP_W + tx]) { if (ty > sy) { sy = ty; sx = tx; } break; }
  const mouth = [(sx + 0.5) * TILE, (sy + 1) * TILE];
  const creek = spline([[mouth[0], mouth[1] - 8], [mouth[0] + 40, mouth[1] + 140], [mouth[0] + 150, mouth[1] + 260], [mouth[0] + 210, mouth[1] + 420]]);
  carveWater(m, creek, (t) => 26 + t * 6);
  for (const p of creek) reserveRound(m, p[0], p[1], 50);
  const dam = [mouth[0] + 8, mouth[1] + 36];
  for (let dx = -60; dx <= 60; dx += 14) m.addSolidProp(dam[0] + dx, dam[1], 10);
  H.addProp(m, 'beaverdam', Math.round(dam[0]), Math.round(dam[1]), 0, { len: 130 });
  H.addProp(m, 'lodge', Math.round(mouth[0] - 70), Math.round(mouth[1] - 50), 26);
  // the boardwalk: north to south over the marsh, planks (dock tiles) wherever it crosses water, rails drawn over
  const bx = Math.round((x1 + 7) * TILE), by0 = Math.round((y0 + 3) * TILE), by1 = Math.round((y1 - 3) * TILE);
  for (let y = by0; y <= by1; y += TILE) for (const o of [-16, 16]) { const i = at(bx + o, y); if (m.tiles[i] === T.WATER || open(i)) { m.tiles[i] = T.DOCK; m.lake[i] = 0; m.reserve[i] |= RES; } }
  H.addProp(m, 'boardwalk', bx, Math.round((by0 + by1) / 2), 0, { len: by1 - by0 + 32 });
  // the fishing pier on the west shore, the canoe beside it
  const py = Math.round(cyL * TILE), px0 = (x0 - 1) * TILE;
  let pierEnd = px0;
  for (let k = 1; k <= 5; k++) { const i = at(px0 + k * TILE + 16, py); if (m.tiles[i] !== T.WATER) break; for (const o of [-16, 16]) { const j = at(px0 + k * TILE + 16, py + o); if (m.tiles[j] === T.WATER) { m.tiles[j] = T.DOCK; m.reserve[j] |= RES; } } pierEnd = px0 + k * TILE + 16; }
  if (pierEnd > px0) H.addProp(m, 'pier', Math.round((px0 + pierEnd) / 2 + 16), py, 0, { len: pierEnd - px0 + 16 });
  H.addProp(m, 'canoe', px0 - 40, py + 70, 0, { a: 1.3 });
  // lily pads in the quiet water, cattails and reeds on the islands' edges
  for (let k = 0; k < 14; k++) {
    const i = marsh.length ? marsh[Math.floor(hash2(k, 1, 943) * marsh.length)] : -1;
    if (i < 0) break;
    H.addProp(m, 'lily', (i % MAP_W + 0.5) * TILE, (Math.floor(i / MAP_W) + 0.5) * TILE, 0, { v: k % 4 });
  }
  for (let k = 0; k < 6; k++) H.addProp(m, 'lily', (x0 + 3 + hash2(k, 2, 944) * (x1 - x0 - 6)) * TILE, (y0 + 3 + hash2(k, 3, 944) * (y1 - y0 - 6)) * TILE, 0, { v: k % 4 });
  // reeds and cattails thick on the islands' edges and along the lake's east shore
  for (let ty = y0; ty <= y1 + 2; ty++) for (let tx = x1 - 4; tx <= x1 + 14; tx++) {
    const i = ty * MAP_W + tx;
    if (!open(i)) continue;
    const wet = [i - 1, i + 1, i - MAP_W, i + MAP_W].filter((j) => m.tiles[j] === T.WATER).length;
    if (!wet || hash2(tx, ty, 947) < 0.25) continue;
    const r = hash2(tx, ty, 948), sp = r < 0.45 ? 'cattails' : r < 0.85 ? 'reeds' : 'tallGrass';
    H.addProp(m, 'shrub_a', (tx + 0.2 + hash2(tx, ty, 949) * 0.6) * TILE, (ty + 0.2 + hash2(tx, ty, 950) * 0.6) * TILE, 0, { sp, k: 1 });
  }
  // willows round the edges, the waterfowl and the herons
  for (const [tx, ty] of [[x0 - 2, y0 + 4], [x0 - 3, cyL + 5], [x1 + 2, y0 - 1], [x1 + 15, cyL], [x0 + 4, y1 + 3], [x1 + 14, y1 - 2]]) {
    const i = Math.round(ty) * MAP_W + Math.round(tx);
    if (!open(i)) continue;
    H.addProp(m, 'tree_a', (Math.round(tx) + 0.5) * TILE, (Math.round(ty) + 0.5) * TILE, 12, { sp: 'willow', k: 1.5 });
  }
  for (const [fx, fy, t] of [[0.3, 0.3, 'swan'], [0.42, 0.36, 'swan'], [0.6, 0.62, 'duck'], [0.64, 0.66, 'duck'], [0.58, 0.7, 'duck']]) H.addProp(m, t, (x0 + fx * (x1 - x0)) * TILE, (y0 + fy * (y1 - y0)) * TILE, 0, { a: hash2(Math.round(fx * 100), 1, 945) * 6.28 });
  for (let k = 0, placed = 0; k < marsh.length && placed < 2; k += 7) { const i = marsh[k]; if (hash2(k, 4, 946) < 0.5) continue; H.addProp(m, 'heron', (i % MAP_W + 0.5) * TILE, (Math.floor(i / MAP_W) + 0.5) * TILE, 0); placed++; }
  (m.landmarks ||= []).push({ name: 'Heron Marsh', type: 'marsh', x: (x0 - 4) * TILE, y: (y0 - 2) * TILE, w: (x1 - x0 + 20) * TILE, h: (y1 - y0 + 8) * TILE });
  m.natureSites.push({ kind: 'marsh', name: 'Heron Marsh', x: Math.round((x1 + 6) * TILE), y: Math.round(cyL * TILE), dam: { x: Math.round(dam[0]), y: Math.round(dam[1]) }, boardwalk: { x: bx, y0: by0, y1: by1 }, marsh: marsh.length });
}

// ---- Granite Peaks: Summit Tarn and the fire lookout (concept N5) -----------------------------------------------
// The tarn spills over a granite ledge on its south shore into a creek; granite outcrops round the water; a log
// cabin in a fenced meadow of lupines on its east side; up the Ridge Trail, a fire lookout on its granite knob.
function summitTarn(m, H) {
  // the tarn's tiles (Summit Tarn: islands.js LAKES)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (let ty = 60; ty < 110; ty++) for (let tx = 545; tx < 610; tx++) if (m.lake[ty * MAP_W + tx]) { n++; x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
  if (n < 40) return;
  const cxT = (x0 + x1 + 1) / 2 * TILE;
  // the outlet: the southernmost lake tile near the middle; the ledge stands just below it, facing south
  let ox = 0, oy = 0;
  for (let tx = Math.floor(cxT / TILE) - 6; tx <= Math.floor(cxT / TILE) + 6; tx++) for (let ty = y1; ty >= y0; ty--) if (m.lake[ty * MAP_W + tx]) { if (ty > oy || (ty === oy && Math.abs(tx * TILE - cxT) < Math.abs(ox - cxT))) { oy = ty; ox = tx * TILE + 16; } break; }
  const F = [ox, (oy + 1) * TILE + 6];
  for (let dx = -70; dx <= 70; dx += 14) m.addSolidProp(F[0] + dx, F[1] - 6, 10);
  for (let ty = oy + 1; ty <= oy + 2; ty++) for (let tx = Math.floor(ox / TILE) - 3; tx <= Math.floor(ox / TILE) + 3; tx++) m.reserve[ty * MAP_W + tx] |= RES;
  // the creek from the foot of the ledge, south and a little west, into the woods
  const creek = spline([[F[0], F[1] + 30], [F[0] - 30, F[1] + 220], [F[0] + 20, F[1] + 420], [F[0] - 40, F[1] + 640]]);
  carveWater(m, creek, (t) => 28 + t * 10);
  for (const p of creek) reserveRound(m, p[0], p[1], 56);
  for (const [t, off, r] of [[0.2, 22, 13], [0.45, -24, 15], [0.7, 20, 12], [0.9, -18, 14]]) { const p = creek[Math.floor(t * (creek.length - 1))]; H.addProp(m, 'boulder', Math.round(p[0] + off), Math.round(p[1]), r, { s: r * 2 + 6, style: 'granite', moss: 1 }); }
  // granite outcrops round the shore (solid), not on the outlet or the cabin's side
  const ring = [];
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (0.95 + k * 0.17), rx = (x1 - x0 + 1) * TILE / 2 + 70, ry = (y1 - y0 + 1) * TILE / 2 + 60;
    const x = cxT + Math.cos(a) * rx, y = (y0 + y1 + 1) / 2 * TILE + Math.sin(a) * ry, i = at(x, y);
    if (m.tiles[i] !== T.GRASS && m.tiles[i] !== T.DIRT) continue;
    const big = hash2(k, 5, 931) < 0.4, r = big ? 34 : 24;
    H.addProp(m, 'outcrop', Math.round(x), Math.round(y), r, { w: big ? 110 : 76, d: big ? 70 : 50, h: big ? 70 : 46, s: k + 3, style: 'granite' });
    reserveRound(m, x, y, 90); ring.push([x, y]);
  }
  // the cabin meadow east of the tarn: lupines and grass, a rail fence, the cabin, its woodpile
  const cab = [(x1 + 6) * TILE, (y0 + y1) / 2 * TILE + 40];
  const meadow = [];
  for (let ty = Math.floor((cab[1] - 200) / TILE); ty <= Math.floor((cab[1] + 160) / TILE); ty++) for (let tx = Math.floor((cab[0] - 160) / TILE); tx <= Math.floor((cab[0] + 220) / TILE); tx++) {
    const i = ty * MAP_W + tx;
    if (m.tiles[i] !== T.GRASS && m.tiles[i] !== T.DIRT) continue;
    m.reserve[i] |= RES; meadow.push(i);
  }
  for (let dy = -26; dy <= 26; dy += 13) for (let dx = -46; dx <= 46; dx += 13) m.addSolidProp(cab[0] + dx, cab[1] + dy - 6, 10);
  H.addProp(m, 'logcabin', cab[0], cab[1] + 30, 0);
  H.addProp(m, 'woodpile', cab[0] + 70, cab[1] + 20, 8);
  H.addProp(m, 'chair', cab[0] - 30, cab[1] + 50, 0, { a: -1.6, v: 1 });
  m.parking.push({ x: cab[0] - 110, y: cab[1] + 40, a: -Math.PI / 2, drive: true });
  for (const [ax, ay, bx, by] of [[-150, 110, 210, 110], [210, -170, 210, 110], [-150, -170, 210, -170]]) H.addProp(m, 'rail', cab[0] + ax, cab[1] + ay, 0, { tx: bx - ax, ty: by - ay });
  for (let k = 0; k < 26; k++) {
    const x = cab[0] - 130 + hash2(k, 1, 932) * 330, y = cab[1] - 150 + hash2(k, 2, 932) * 250;
    if (Math.abs(x - cab[0]) < 80 && Math.abs(y - cab[1]) < 60) continue;
    H.addProp(m, 'flowers_a', Math.round(x), Math.round(y), 0, { sp: hash2(k, 3, 932) < 0.7 ? 'aLupine' : 'paintbrush', k: 1 });
  }
  // the fire lookout up the Ridge Trail: on the trail's highest stretch, a granite knob beside it
  const trail = (m.roads || []).find((r) => r.name === 'Ridge Trail' && r.pts.length > 4);
  if (trail) {
    const p = trail.pts[Math.floor(trail.pts.length * 0.62)], q = trail.pts[Math.floor(trail.pts.length * 0.62) + 1];
    const ux = q.x - p.x, uy = q.y - p.y, ul = Math.hypot(ux, uy) || 1, nx = -uy / ul, ny = ux / ul;
    const L = [p.x + nx * 170, p.y + ny * 170];
    if (m.tiles[at(L[0], L[1])] !== T.GRASS && m.tiles[at(L[0], L[1])] !== T.DIRT) { L[0] = p.x - nx * 170; L[1] = p.y - ny * 170; }
    reserveRound(m, L[0], L[1], 130);
    for (let dy = -30; dy <= 30; dy += 15) for (let dx = -30; dx <= 30; dx += 15) m.addSolidProp(L[0] + dx, L[1] + dy - 10, 10);
    H.addProp(m, 'lookout', Math.round(L[0]), Math.round(L[1] + 20), 0);
    H.addProp(m, 'solar', Math.round(L[0] + 70), Math.round(L[1] + 30), 0);
    H.addProp(m, 'outcrop', Math.round(L[0] - 90), Math.round(L[1] + 60), 30, { w: 96, d: 60, h: 54, s: 21, style: 'granite' });
    // a footpath from the trail to its stairs
    for (let k = 0; k <= 170; k += 14) { const i = at(p.x + nx * k * Math.sign((L[0] - p.x) * nx + (L[1] - p.y) * ny), p.y + ny * k * Math.sign((L[0] - p.x) * nx + (L[1] - p.y) * ny)); if (m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT; }
    (m.landmarks ||= []).push({ name: 'Ridge Fire Lookout', type: 'lookout', x: Math.round(L[0] - 150), y: Math.round(L[1] - 150), w: 300, h: 260 });
  }
  (m.landmarks ||= []).push({ name: 'Summit Tarn Falls', type: 'falls', x: Math.round(F[0] - 300), y: Math.round(y0 * TILE - 40), w: 600, h: Math.round((y1 - y0) * TILE + 240) });
  m.natureSites.push({ kind: 'tarn', name: 'Summit Tarn', x: Math.round(cxT), y: Math.round((y0 + y1) / 2 * TILE), falls: { x: Math.round(F[0]), y: Math.round(F[1]), w: 70, drop: 40 }, cabin: { x: Math.round(cab[0]), y: Math.round(cab[1]) }, outcrops: ring.length });
}

// ---- the campgrounds, lived in (concept N11, the forest camps) -------------------------------------------------
// Round every campground fire: camp chairs or a log bench facing it, a cooler, a lantern on a post, a woodpile,
// and festoon lights strung over a few pitches.
function campDressing(m, H) {
  const free = (x, y) => { const t = m.tiles[at(x, y)]; return t === T.DIRT || t === T.GRASS; };
  for (const L of (m.landmarks || []).filter((l) => l.type === 'camp')) {
    const fires = m.props.filter((p) => p && p.t === 'campfire' && p.x >= L.x && p.x < L.x + L.w && p.y >= L.y && p.y < L.y + L.h);
    fires.forEach((f, k) => {
      const h = (n) => hash2(Math.round(f.x) + n * 13, Math.round(f.y), 901 + n);
      // seats: two chairs (south-west and south-east of the fire) or a log bench south of it
      if (h(1) < 0.55) { for (const [dx, dy, a] of [[-26, 14, -0.6], [24, 16, -2.5]]) if (free(f.x + dx, f.y + dy)) H.addProp(m, 'chair', f.x + dx, f.y + dy, 0, { a, v: Math.floor(h(2) * 4) }); }
      else if (free(f.x, f.y + 26)) H.addProp(m, 'log', f.x, f.y + 26, 0, { a: 0, len: 80, seat: 1 });
      if (h(3) < 0.6 && free(f.x + 30, f.y - 12)) H.addProp(m, 'cooler', f.x + 30, f.y - 12, 0, { v: Math.floor(h(4) * 3) });
      if (h(5) < 0.5 && free(f.x - 34, f.y - 20)) H.addProp(m, 'lantern', f.x - 34, f.y - 20, 0);
      if (h(6) < 0.35 && free(f.x + 40, f.y + 10)) H.addProp(m, 'woodpile', f.x + 40, f.y + 10, 0);
      // festoon lights from the tent's corner to a post past the fire on every third pitch
      const tent = m.props.find((p) => p && p.t === 'tent' && Math.hypot(p.x - f.x, p.y - f.y) < 120);
      if (tent && k % 3 === 0) H.addProp(m, 'festoon', tent.x + 14, tent.y - 4, 0, { tx: Math.round(f.x + 44 - (tent.x + 14)), ty: Math.round(f.y - 30 - (tent.y - 4)), h: 34 });
    });
  }
}

// ---- a bonfire on the beach (concept N11, the beach camp) -------------------------------------------------------
// On the open sand of Gull Harbor, clear of the road: a big driftwood fire ringed with logs, a surfboard stuck in the
// sand, towels, a cooler, two tiki torches.
function beachBonfire(m, H) {
  const cand = [];
  for (const want of DISTRICT_NAMES.beaches) {
    for (let ty = 3; ty < MAP_H - 3; ty++) for (let tx = 4; tx < MAP_W - 4; tx++) {
      const i = ty * MAP_W + tx;
      if (m.tiles[i] !== T.SAND || m.dist[i] !== want || m.reserve[i]) continue;
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -3; dx <= 3; dx++) { const t = m.tiles[(ty + dy) * MAP_W + tx + dx]; if (t !== T.SAND || m.reserve[(ty + dy) * MAP_W + tx + dx]) { ok = false; break; } }
      if (!ok) continue;
      let sea = 99; for (let r = 3; r < 10 && sea === 99; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const t = m.tiles[(ty + dy) * MAP_W + tx + dx]; if (t === T.WATER || t === T.DEEP) { sea = r; break; } }
      if (sea < 99) cand.push([tx, ty, sea]);
    }
    if (cand.length) break;
  }
  if (!cand.length) return;
  cand.sort((a, b) => a[2] - b[2] || hash2(a[0], a[1], 920) - hash2(b[0], b[1], 920));
  const [tx, ty] = cand[Math.floor(cand.length * 0.3)], X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) m.reserve[(ty + dy) * MAP_W + tx + dx] |= RES;
  H.addProp(m, 'campfire', X, Y, 0, { lit: 1, big: 1 });
  for (const [dx, dy, a] of [[0, 30, 0], [-36, -4, 1.4], [36, -2, 1.75]]) H.addProp(m, 'driftwood', X + dx, Y + dy, 0, { a, len: 50, seat: 1 });
  H.addProp(m, 'surfboard', X - 64, Y - 26, 0, { v: 1 });
  H.addProp(m, 'surfboard', X - 54, Y - 30, 0, { v: 2 });
  H.addProp(m, 'cooler', X + 50, Y + 22, 0, { v: 0 });
  for (const [dx, dy, v] of [[-34, 52, 0], [22, 54, 1]]) H.addProp(m, 'towel', X + dx, Y + dy, 0, { v });
  for (const [dx, dy] of [[-70, 20], [72, -24]]) H.addProp(m, 'torch', X + dx, Y + dy, 0);
  (m.landmarks ||= []).push({ name: 'Bonfire Beach', type: 'bonfire', x: Math.round(X - 200), y: Math.round(Y - 150), w: 400, h: 300 });
  m.natureSites.push({ kind: 'bonfire', name: 'Bonfire Beach', x: Math.round(X), y: Math.round(Y) });
}

// ---- a camp in the desert (concept N11, the desert camp) --------------------------------------------------------
// At the end of the Mirage Track: two pickups nosed in, a fire pit ringed with stones, camp chairs, festoon lights
// on posts, a windmill over a water trough, saguaros round it.
function desertCamp(m, H) {
  const road = (m.roads || []).find((r) => r.name === 'Mirage Track');
  if (!road) return;
  const end = road.pts[road.pts.length - 1], prev = road.pts[road.pts.length - 2];
  const ux = (end.x - prev.x), uy = (end.y - prev.y), ul = Math.hypot(ux, uy) || 1, dx = ux / ul, dy = uy / ul;
  // the camp near the track's end, on the open ground with the most room (the track runs down to a lake)
  const r0 = 170, landT = (t) => t === T.DIRT || t === T.SAND || t === T.GRASS;
  let X = 0, Y = 0, best = -1;
  for (let oy = -420; oy <= 420; oy += 32) for (let ox = -420; ox <= 420; ox += 32) {
    const x = end.x + ox, y = end.y + oy;
    let room = 0;
    for (let r = 32; r <= 260; r += 32) {
      let ok = true;
      for (let a = 0; a < 16 && ok; a++) { const i = at(x + Math.cos(a / 16 * 6.283) * r, y + Math.sin(a / 16 * 6.283) * r); if (!landT(m.tiles[i]) || m.reserve[i]) ok = false; }
      if (!ok) break;
      room = r;
    }
    const score = room - Math.hypot(ox, oy) * 0.15;
    if (room >= 200 && score > best) { best = score; X = x; Y = y; }
  }
  if (best < 0) return;
  for (let ty = Math.floor((Y - r0) / TILE); ty <= Math.floor((Y + r0) / TILE); ty++) for (let tx = Math.floor((X - r0) / TILE); tx <= Math.floor((X + r0) / TILE); tx++) {
    const i = ty * MAP_W + tx, d = Math.hypot((tx + 0.5) * TILE - X, (ty + 0.5) * TILE - Y);
    if (d > r0 || (m.tiles[i] !== T.DIRT && m.tiles[i] !== T.SAND && m.tiles[i] !== T.GRASS)) continue;
    if (d < r0 - 30) m.tiles[i] = T.DIRT;
    m.reserve[i] |= RES;
  }
  // a dirt way in from the track's end to the camp
  { const L = Math.hypot(X - end.x, Y - end.y), ex = (X - end.x) / (L || 1), ey = (Y - end.y) / (L || 1);
    for (let k = 0; k <= L; k += 16) for (let o = -24; o <= 24; o += 16) { const i = at(end.x + ex * k - ey * o, end.y + ey * k + ex * o); if (m.tiles[i] === T.SAND || m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT; if (landT(m.tiles[i])) m.reserve[i] |= RES; } }
  void dx; void dy;
  H.addProp(m, 'campfire', X, Y, 0, { lit: 1, tire: 1 });
  for (const [ox, oy, a] of [[-30, 14, -0.6], [28, 18, -2.5], [-6, -30, 1.6]]) H.addProp(m, 'chair', X + ox, Y + oy, 0, { a, v: 2 });
  H.addProp(m, 'cooler', X + 40, Y - 20, 0, { v: 1 });
  // the pickups, side by side west of the fire, nosed toward it
  for (const o of [-1, 1]) m.parking.push({ x: X - 110, y: Y + o * 44, a: 0, drive: true });
  // festoon lights on three posts round the north of the fire
  const posts = [[X - 80, Y - 60], [X + 10, Y - 84], [X + 96, Y - 50]];
  for (const [x, y] of posts) H.addProp(m, 'post', x, y, 5);
  for (let k = 1; k < posts.length; k++) H.addProp(m, 'festoon', posts[k - 1][0], posts[k - 1][1], 0, { tx: Math.round(posts[k][0] - posts[k - 1][0]), ty: Math.round(posts[k][1] - posts[k - 1][1]), h: 44 });
  // the windmill and its trough to the east, saguaros round about
  H.addProp(m, 'windmill', X + 150, Y - 10, 18);
  H.addProp(m, 'trough', X + 150, Y + 34, 10);
  for (const [ox, oy] of [[-150, -90], [-60, 130], [120, 120], [200, -110]]) H.addProp(m, 'cactus', X + ox, Y + oy, 8, { sp: 'saguaroBig', k: 1 });
  (m.landmarks ||= []).push({ name: 'Mirage Camp', type: 'camp', x: Math.round(X - 180), y: Math.round(Y - 140), w: 360, h: 280 });
  m.natureSites.push({ kind: 'desertcamp', name: 'Mirage Camp', x: Math.round(X), y: Math.round(Y) });
}

// ---- Lighthouse Rock: the keeper's cottage and the tidepools (concepts N8, N8-B, N8-C) -------------------------
// The lighthouse stands on grass now (its paved square goes), a path runs down to the jetty, the keeper's
// cottage stands beside it. The island's east shore is a tidepool shelf: shallow pools among barnacled basalt
// rocks with starfish, urchins, anemones and crabs; sea stacks and a seal rock offshore, gulls on the rocks.
function lighthouseTidepools(m, H) {
  const lh = m.buildings.find((b) => b && b.kind === 'lighthouse');
  if (!lh) return;
  const cx = lh.tx + 2, cy = lh.ty + 2, comp = m.compLab ? m.compLab[cy * MAP_W + cx] : -1;
  const onIsland = (tx, ty) => m.compLab ? m.compLab[ty * MAP_W + tx] === comp : true;
  // the paved square: grass, a stone apron one tile round the tower, a dirt path south to the jetty
  for (let ty = cy - 6; ty < cy + 6; ty++) for (let tx = cx - 6; tx < cx + 6; tx++) {
    const i = ty * MAP_W + tx;
    if (m.tiles[i] !== T.PLAZA) continue;
    const ring = tx >= lh.tx - 1 && tx <= lh.tx + lh.tw && ty >= lh.ty - 1 && ty <= lh.ty + lh.th;
    m.tiles[i] = ring ? T.PLAZA : Math.abs(tx - cx) <= 1 && ty > cy ? T.DIRT : T.GRASS;
    m.reserve[i] |= RES;
  }
  for (let ty = cy + 6; ty < cy + 22; ty++) for (let tx = cx - 1; tx <= cx + 1; tx++) { const i = ty * MAP_W + tx; if (m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
  // the keeper's cottage, east of the tower: solid over its footprint
  const kx = (cx + 8) * TILE, ky = (cy + 2) * TILE;
  for (let dy = -22; dy <= 22; dy += 14) for (let dx = -40; dx <= 40; dx += 14) m.addSolidProp(kx + dx, ky + dy - 4, 10);
  H.addProp(m, 'cottage', kx, ky + 26, 0, { w: 84, d: 54 });
  for (let ty = cy - 1; ty <= cy + 5; ty++) for (let tx = cx + 5; tx <= cx + 11; tx++) m.reserve[ty * MAP_W + tx] |= RES;
  H.addProp(m, 'pbench', kx - 70, ky + 50, 0);
  // the tidepool shelf: the island's sand east of the tower, widened two tiles into the grass behind it
  const widen = [];
  for (let ty = cy - 30; ty <= cy + 30; ty++) for (let tx = cx + 14; tx <= cx + 46; tx++) {
    if (!onIsland(tx, ty) || m.tiles[ty * MAP_W + tx] !== T.GRASS || (m.reserve[ty * MAP_W + tx] & RES)) continue;
    let sand = false;
    for (let dy = -2; dy <= 2 && !sand; dy++) for (let dx = -2; dx <= 2; dx++) if (m.tiles[(ty + dy) * MAP_W + tx + dx] === T.SAND) { sand = true; break; }
    if (sand) widen.push(ty * MAP_W + tx);
  }
  for (const i of widen) m.tiles[i] = T.SAND;
  const shelf = [];
  for (let ty = cy - 30; ty <= cy + 30; ty++) for (let tx = cx + 16; tx <= cx + 46; tx++) if (onIsland(tx, ty) && m.tiles[ty * MAP_W + tx] === T.SAND) shelf.push([tx, ty]);
  if (!shelf.length) return;
  const isSand = (tx, ty) => m.tiles[ty * MAP_W + tx] === T.SAND && onIsland(tx, ty);
  const pools = [];
  for (let gy = cy - 30; gy <= cy + 30; gy += 3) for (let gx = cx + 14; gx <= cx + 46; gx += 3) {
    const px = gx + Math.floor(hash2(gx, gy, 801) * 3), py = gy + Math.floor(hash2(gx, gy, 802) * 3);
    if (!isSand(px, py) || [isSand(px + 1, py), isSand(px, py + 1), isSand(px - 1, py), isSand(px, py - 1)].filter(Boolean).length < 3) continue;
    if (hash2(gx, gy, 803) < 0.1) continue;
    const rx = 1.1 + hash2(gx, gy, 804) * 0.9, ry = 0.8 + hash2(gx, gy, 805) * 0.6, X = (px + 0.5) * TILE, Y = (py + 0.5) * TILE;
    for (let ty = py - 2; ty <= py + 2; ty++) for (let tx = px - 2; tx <= px + 2; tx++) {
      if (((tx - px) / rx) ** 2 + ((ty - py) / ry) ** 2 > 1 || !isSand(tx, ty)) continue;
      const i = ty * MAP_W + tx; m.tiles[i] = T.WATER; m.reserve[i] |= RES;   // (land stays: a shallow pool, not the sea)
    }
    pools.push([X, Y, rx * TILE, ry * TILE, gx, gy]);
  }
  // round each pool: barnacled basalt rocks (solid), life in and round it
  const life = ['starfish', 'starfish', 'urchin', 'anemone', 'urchin', 'anemone'];
  for (const [X, Y, RX, RY, gx, gy] of pools) {
    const n = 2 + Math.floor(hash2(gx, gy, 806) * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + hash2(gx, gy, 807 + k) * 1.2, r = 14 + Math.floor(hash2(gx + k, gy, 808) * 3) * 4;
      const x = X + Math.cos(a) * (RX + r * 0.6), y = Y + Math.sin(a) * (RY + r * 0.5);
      if (m.tiles[at(x, y)] !== T.SAND) continue;
      H.addProp(m, 'boulder', Math.round(x), Math.round(y), Math.round(r * 0.75), { s: r * 2 + 4, style: 'basalt', barn: 1 });
    }
    for (let k = 0; k < 4; k++) {
      const x = X + (hash2(gx, gy + k, 809) - 0.5) * RX * 1.2, y = Y + (hash2(gx + k, gy, 810) - 0.5) * RY * 1.1;
      if (m.tiles[at(x, y)] !== T.WATER) continue;
      H.addProp(m, life[Math.floor(hash2(gx, gy, 811 + k) * life.length)], Math.round(x), Math.round(y), 0, { v: Math.floor(hash2(gx, gy, 812 + k) * 4) });
    }
    if (hash2(gx, gy, 813) < 0.4) H.addProp(m, 'crab', Math.round(X + RX + 10), Math.round(Y + 4), 0, { a: Math.round(hash2(gx, gy, 814) * 628) / 100 });
  }
  // driftwood up the beach
  for (let k = 0; k < 4; k++) { const [tx, ty] = shelf[Math.floor(hash2(k, 3, 815) * shelf.length)]; if (m.tiles[ty * MAP_W + tx] === T.SAND) H.addProp(m, 'driftwood', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 0, { a: Math.round(hash2(k, 4, 815) * 314) / 100, len: 40 + Math.floor(hash2(k, 5, 815) * 3) * 10 }); }
  // offshore: sea stacks and the seal rock, in the water east of the shelf (solid: boats steer round them)
  const water = (tx, ty) => m.tiles[ty * MAP_W + tx] === T.WATER || m.tiles[ty * MAP_W + tx] === T.DEEP;
  const spots = [];
  for (let ty = cy - 30; ty <= cy + 28; ty += 2) for (let tx = cx + 30; tx <= cx + 60; tx += 2) {
    if (!water(tx, ty)) continue;
    let near = 99; for (let r = 1; r < 10 && near === 99; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!water(tx + dx, ty + dy)) { near = r; break; }
    if (near >= 3 && near <= 8) spots.push([tx, ty, near]);
  }
  const used = [];
  const take = (minGap) => { for (const sp of spots) if (used.every((u) => Math.hypot(u[0] - sp[0], u[1] - sp[1]) >= minGap)) { used.push(sp); return sp; } return null; };
  spots.sort((a, b) => hash2(a[0], a[1], 816) - hash2(b[0], b[1], 816));
  for (let k = 0; k < 3; k++) { const sp = take(7); if (!sp) break; const r = 24 + k * 6, h = 130 + k * 40; H.addProp(m, 'seastack', (sp[0] + 0.5) * TILE, (sp[1] + 0.5) * TILE, r, { r, h, s: k + 1 }); }
  const sr = take(6);
  if (sr) {
    const X = (sr[0] + 0.5) * TILE, Y = (sr[1] + 0.5) * TILE;
    H.addProp(m, 'sealrock', X, Y, 40, { w: 120, d: 70 });
    for (const [dx, dy, p, a] of [[-24, -6, 0, 0.3], [18, 4, 1, 2.8], [-6, 16, 0, 1.2]]) H.addProp(m, 'seal', X + dx, Y + dy, 0, { pose: p, a, z: 32 });
    H.addProp(m, 'gull', X + 40, Y - 10, 0, { a: 0.4, z: 32 });
  }
  for (const [X, Y] of pools.slice(0, 3)) H.addProp(m, 'gull', X - 30, Y - 22, 0, { a: 2.4, z: 0 });
  (m.landmarks ||= []).push({ name: 'Lighthouse Tidepools', type: 'tidepools', x: (cx + 18) * TILE, y: (cy - 16) * TILE, w: 26 * TILE, h: 30 * TILE });
  m.natureSites.push({ kind: 'tidepools', name: 'Lighthouse Tidepools', x: (cx + 30) * TILE, y: cy * TILE, pools: pools.length, cottage: { x: kx, y: ky } });
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

// ---- the wash and the track in Red Rock Canyon (concepts N4-B, N4-C) ---------------------------------------------
// A dry wash of pale gravel and cobbles winds from the oasis pool south-east across the canyon floor and out to the
// beach, mesquite and palo verde along it (they follow the water under the sand), boulders in its bends; a dirt
// track comes in from the desert road on the west, between the mesas, to a turnaround by the oasis. The wash is
// sand tiles (drawn as river gravel inside the canyon), the track a polyline the ground bake draws as dirt (m.tracks).
function canyonWash(m, H) {
  const pt = (m.paintings || []).find((p) => p.key === 'canyon'), o = (m.natureSites || []).find((q) => q.kind === 'oasis');
  if (!pt || !o) return;
  const at = (tx, ty) => Math.floor(ty) * MAP_W + Math.floor(tx);
  const T0 = (tx, ty) => [pt.x + tx * TILE, pt.y + ty * TILE];
  const add = (t, x, y, r = 0, extra = null) => H.addProp(m, t, Math.round(x), Math.round(y), r, extra);
  const clearR = (x, y, r) => m.props.forEach((q, i) => { if (q && q.t !== 'painted' && Math.hypot(q.x - x, q.y - y) < r) dropProp(m, i); });
  // the wash: from the pool's south side out across the floor, east to the sea
  const wash = spline([[o.x + 10, o.y + 60], T0(29, 14), T0(35, 18), T0(40, 23), T0(45, 27), T0(51, 31), T0(56, 35), T0(61, 38.5)], 14);
  for (const [x, y] of wash) {
    clearR(x, y, 40);
    const k = Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE);
    paint(m, x, y, 26 + 10 * hash2(Math.floor(x / 64), Math.floor(y / 64), 2401), T.SAND, (t) => t === T.DIRT || t === T.GRASS);
    void k;
  }
  // its banks: mesquite and palo verde, boulders in the bends, brittlebush and dry grass
  for (let k = 6; k < wash.length - 4; k += 7) {
    const [x0, y0] = wash[k - 1], [x1, y1] = wash[k], l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l, sd = k % 2 ? 1 : -1;
    const tx = x1 + nx * sd * 62, ty = y1 + ny * sd * 62, i = at(tx / TILE, ty / TILE);
    if (m.tiles[i] !== T.DIRT && m.tiles[i] !== T.GRASS) continue;
    const h = hash2(k, 3, 2402);
    if (h < 0.5) add('tree_a', tx, ty, 10, { sp: h < 0.25 ? 'mesquite' : 'paloVerde', k: 1.2 });
    else if (h < 0.8) add('boulder', x1 - nx * sd * 30, y1 - ny * sd * 30, 14, { s: 22 + Math.round(h * 20) });
    else add('shrub_a', tx, ty, 0, { sp: 'brittle', k: 1 });
  }
  for (let k = 3; k < wash.length; k += 5) { const [x, y] = wash[k]; add('boulder', x + (hash2(k, 1, 2403) - 0.5) * 30, y + (hash2(k, 2, 2403) - 0.5) * 20, 0, { s: 9 + Math.round(hash2(k, 4, 2403) * 8) }); }   // (cobbles in the bed)
  // the track: from the desert road west of the canyon, between the mesas, to a turnaround by the oasis
  const road = (m.roads || []).filter((r) => r.lvl === 0).map((r) => r.pts).flat().reduce((b, q) => { const d = Math.hypot(q.x - (pt.x - 6 * TILE), q.y - (pt.y + 16 * TILE)); return !b || d < b.d ? { x: q.x, y: q.y, d } : b; }, null);
  if (road && road.d < 20 * TILE) {
    const tp = spline([[road.x + 60, road.y], T0(-4, 15.6), T0(4, 15.2), T0(12, 14.6), T0(19, 13.2), [o.x - 150, o.y + 120]], 12);
    for (const [x, y] of tp) clearR(x, y, 34);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of tp) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    (m.tracks ||= []).push({ pts: tp, hw: 26, bb: [x0 - 40, y0 - 40, x1 + 40, y1 + 40] });
    for (const [x, y] of tp) reserveRound(m, x, y, 30);
    const [ex, ey] = tp[tp.length - 1];
    (m.tracks).push({ pts: [[ex - 40, ey], [ex + 40, ey]], hw: 52, bb: [ex - 100, ey - 60, ex + 100, ey + 60] });   // (the turnaround)
    m.parking.push({ x: Math.round(ex), y: Math.round(ey), a: 0.2, drive: true });
    add('roadsign', road.x + 90, road.y - 44, 0, { k: 'arrow', a: 0 });
    add('mapboard', ex + 70, ey - 36, 10);
  }
  (m.landmarks ||= []).push({ name: 'Red Rock Wash', type: 'wash', x: Math.round(wash[0][0]), y: Math.round(wash[0][1]), w: Math.round(wash[wash.length - 1][0] - wash[0][0]), h: Math.round(wash[wash.length - 1][1] - wash[0][1]) });
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

// ---- Willow River (Dry Creek; concepts W1, W2, NK1-E / NK1-N) ---------------------------------------------------
// A river through the farm country north of the oil field. A creek off the wooded headland on the north coast runs
// down to a basalt escarpment and drops over it in a broad stepped fall into a plunge pool; a run of rapids among
// boulders; under the Oil Field Road on an old two-arch stone bridge; then gravel bars on the inside of its bends,
// reed beds and willows, an angler's spot on the shingle and a canoe, down into Willow Lake below the railway, with
// a jetty and a rowboat. Beside the road a red barn with hay bales and a fenced pasture (the livestock graze there:
// wildlife.js), a corn patch across the river. The banks are lush meadow in the dry country (reserve bit 128); the
// river and the lake are fresh water (fishing, swimming; boats float on them).
const LUSH = 128;
function willowRiver(m, H) {
  const road = (m.roads || []).find((r) => r.name === 'Dry Creek Oil Field Road' && r.pts.length > 2);
  if (!road) return;
  // the crossing: the long east-west stretch, at x = 1072 tiles
  let C = null;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], X = 1072 * TILE;
    if ((a.x - X) * (b.x - X) > 0 || Math.abs(b.x - a.x) < 400) continue;
    const t = (X - a.x) / (b.x - a.x);
    C = { x: X, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  if (!C) return;
  if (C.a > Math.PI / 2 || C.a < -Math.PI / 2) C.a += Math.PI;                 // (east along the road)
  const ux = Math.cos(C.a), uy = Math.sin(C.a), nx = -uy, ny = ux;            // u: east along the road; n: south across it
  const P = (u, n) => [C.x + ux * u + nx * n, C.y + uy * u + ny * n];
  const RW = road.hw || 64;
  const fresh = [];
  const water = (pts, hw, lake = false) => { const t = carveWater(m, pts, hw); for (const i of t) { if (lake) m.lake[i] = 1; fresh.push(i); } return t; };
  // anything the map had put where the water and the cliff go (the wilds' trees come later and keep off reserved ground)
  const clearArea = (x, y, r) => m.props.forEach((p, i) => { if (p && p.t !== 'painted' && Math.hypot(p.x - x, p.y - y) < r) dropProp(m, i); });
  // the creek off the headland, down to the lip of the falls
  const F = P(150, -760);                                                     // the lip (centre)
  const creek = spline([P(900, -1940), P(700, -1700), P(480, -1400), P(300, -1100), P(190, -880), [F[0], F[1] - 30]]);
  water(creek, (s) => 20 + s * 12 + Math.sin(s * 23) * 3);
  // the escarpment: a band of basalt along the lip, two tiles deep (solid), the water going over it in the middle
  const CL0 = -330, CL1 = 600;                                                // its ends (u)
  for (let u = CL0; u <= CL1; u += 16) for (let n = -800; n <= -744; n += 16) {
    const [x, y] = P(u, n), i = at(x, y);
    if (Math.abs(u - 150) < 62 || KEEP.has(m.tiles[i])) continue;              // (the falls' notch: water runs over)
    m.tiles[i] = T.WALL; m.land[i] = 1; m.river[i] = 0; m.reserve[i] |= RES;
  }
  for (let u = CL0; u <= CL1; u += 22) { const [x, y] = P(u, -772); if (Math.abs(u - 150) >= 62) m.addSolidProp(x, y, 14); }
  { const [x, y] = P((CL0 + CL1) / 2, -770); clearArea(x, y, 560); }
  // the plunge pool below the falls, then the river: rapids down to the bridge, gentle bends below it to the lake
  const pool = P(150, -640);
  const oval = (c, rx, ry, lake) => {   // an oval of water (rx along the road, ry across it), wobbly edged
    for (let ty = Math.floor((c[1] - ry - 80) / TILE); ty <= Math.floor((c[1] + ry + 80) / TILE); ty++) for (let tx = Math.floor((c[0] - rx - 80) / TILE); tx <= Math.floor((c[0] + rx + 80) / TILE); tx++) {
      const i = ty * MAP_W + tx, X = (tx + 0.5) * TILE - c[0], Y = (ty + 0.5) * TILE - c[1];
      const u = X * ux + Y * uy, n = X * nx + Y * ny, a = Math.atan2(n, u), wob = 1 + Math.sin(a * 3 + 1) * 0.07 + Math.sin(a * 5) * 0.04;
      if ((u / rx) ** 2 + (n / ry) ** 2 > wob * wob || KEEP.has(m.tiles[i]) || m.tiles[i] === T.WALL) continue;
      m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; if (lake) m.lake[i] = 1; m.reserve[i] |= RES; fresh.push(i);
    }
  };
  oval(pool, 140, 76, false);
  const upper = spline([P(150, -620), P(110, -470), P(40, -320), P(-10, -170), P(0, 0)]);
  const lower = spline([P(0, 0), P(-70, 190), P(20, 400), P(120, 600), P(90, 800), P(170, 960)]);
  const hwR = (s) => 62 + Math.sin(s * 17 + 1) * 8 + Math.sin(s * 5.3) * 6;
  water(upper, (s) => 54 + s * 8 + Math.sin(s * 21) * 5);
  water(lower, hwR);
  // Willow Lake: an oval on the river's mouth, reed-fringed
  const L = P(180, 1220), LR = [480, 290];
  oval(L, LR[0], LR[1], true);
  { clearArea(L[0], L[1], 640); for (const p of upper.concat(lower, creek)) clearArea(p[0], p[1], 110); }
  // the banks: lush meadow four tiles either side of all of it (the wilds keep their trees off it); gravel bars on the
  // inside of the bends below the bridge (shingle)
  const wet = new Set(fresh);
  for (const i of fresh) {
    const tx = i % MAP_W, ty = Math.floor(i / MAP_W);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy > 18) continue;
      const j = (ty + dy) * MAP_W + tx + dx;
      if (wet.has(j) || KEEP.has(m.tiles[j]) || m.tiles[j] === T.WALL || m.tiles[j] === T.WATER || m.tiles[j] === T.DEEP) continue;
      if (m.tiles[j] === T.DIRT || m.tiles[j] === T.SAND || m.tiles[j] === T.GRASS) m.tiles[j] = T.GRASS;
      m.reserve[j] |= RES | LUSH;
    }
  }
  const bars = [];
  for (const [s, side, len] of [[0.16, 1, 0.12], [0.38, -1, 0.1], [0.6, 1, 0.12], [0.8, -1, 0.1]]) {
    for (let k = 0; k < 14; k++) {
      const t = s + (k / 13 - 0.5) * len, i0 = Math.min(lower.length - 2, Math.floor(t * (lower.length - 1))), p = lower[i0], q = lower[i0 + 1], dl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const ox = -(q[1] - p[1]) / dl * side, oy = (q[0] - p[0]) / dl * side, w = Math.sin(k / 13 * Math.PI) * 52;
      for (let d = 0; d <= w; d += 16) { const x = p[0] + ox * (hwR(t) - 18 + d), y = p[1] + oy * (hwR(t) - 18 + d), j = at(x, y); if (m.tiles[j] === T.WATER && !m.lake[j] && d > 12) continue; if (KEEP.has(m.tiles[j]) || m.lake[j]) continue; m.tiles[j] = T.SAND; m.land[j] = 1; m.river[j] = 0; m.reserve[j] |= RES | LUSH; }
      if (k === 6) bars.push([p[0] + ox * (hwR(t) + 14), p[1] + oy * (hwR(t) + 14), side, Math.atan2(q[1] - p[1], q[0] - p[0])]);
    }
  }
  // the freshwater shore for the reed beds (statics.js coverAt reads distRiver, quarter tiles): within three tiles
  if (m.distRiver) for (const i of fresh) { m.distRiver[i] = 0; const tx = i % MAP_W, ty = Math.floor(i / MAP_W); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = (ty + dy) * MAP_W + tx + dx; if (wet.has(j)) continue; const d = Math.round(Math.hypot(dx, dy) * 4); if (!m.distRiver[j] || m.distRiver[j] > d) m.distRiver[j] = d; } }
  // the bridge: parapets along both edges of the road where the river runs under it (solid)
  const span = 150;
  for (const side of [-1, 1]) for (let u = -span; u <= span; u += 20) { const [x, y] = P(u, side * (RW + 6)); m.addSolidProp(x, y, 8); }
  // boulders: a scatter through the rapids below the pool, a few on the bends further down (mossy, solid)
  for (const [s, off, r] of [[0.12, -24, 15], [0.22, 20, 12], [0.3, -6, 17], [0.42, 30, 13], [0.5, -34, 11], [0.58, 10, 14], [0.68, -20, 12]]) {
    const i0 = Math.min(upper.length - 2, Math.floor(s * (upper.length - 1))), p = upper[i0], q = upper[i0 + 1], dl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    H.addProp(m, 'boulder', Math.round(p[0] - (q[1] - p[1]) / dl * off), Math.round(p[1] + (q[0] - p[0]) / dl * off), r, { s: r * 2 + 4, moss: 1, foam: 1 });
  }
  for (const [dx, dy, r] of [[-170, -40, 24], [170, -30, 21], [-120, 40, 14], [130, 52, 12]]) H.addProp(m, 'boulder', Math.round(pool[0] + dx), Math.round(pool[1] + dy), r, { s: r * 2 + 6, moss: 1 });
  // trees: dark pines on the escarpment's shoulders and round the pool (W1's falls); willows along the river and the
  // lake; a few big oaks in the meadows
  const tree = (u, n, sp, k, r = 12) => { const [x, y] = P(u, n), i = at(x, y); if (m.tiles[i] !== T.GRASS && m.tiles[i] !== T.DIRT) return; H.addProp(m, 'tree_a', Math.round(x), Math.round(y), r, { sp, k }); reserveRound(m, x, y, 40); };
  for (const [u, n] of [[-280, -860], [-150, -900], [-40, -870], [380, -880], [500, -850], [560, -930], [-260, -560], [420, -560], [460, -460]]) tree(u, n, hash2(u, n, 971) < 0.6 ? 'fir' : 'pondPine', 1.4 + hash2(u, n, 972) * 0.25);
  for (const [u, n] of [[-170, -330], [190, -300], [-180, 150], [150, 250], [-150, 520], [270, 470], [-60, 700], [300, 760], [-220, 1010], [560, 1060], [-280, 1300], [640, 1260], [420, 1520]]) tree(u, n, 'willow', 1.45 + hash2(u, n, 973) * 0.2, 14);
  for (const [u, n] of [[-520, 260], [-640, -180], [520, 300]]) tree(u, n, 'oak', 1.5, 16);
  // the angler's spot on the first gravel bar: a folding chair, the tackle box, a rod on its rest; a canoe drawn up
  // on the next bar; another out on the lake
  if (bars[0]) { const [x, y, sd, a] = bars[0]; H.addProp(m, 'chair', Math.round(x), Math.round(y), 0, { a: a + sd * Math.PI / 2 }); H.addProp(m, 'cooler', Math.round(x + Math.cos(a) * 26), Math.round(y + Math.sin(a) * 26), 0); }
  if (bars[1]) { const [x, y, , a] = bars[1]; H.addProp(m, 'canoe', Math.round(x), Math.round(y), 0, { a }); }
  { const [x, y] = P(260, 1180); H.addProp(m, 'canoe', Math.round(x), Math.round(y), 0, { a: C.a + 0.5, c: 1 }); }
  // the jetty on the lake's west shore, the rowboat tied up at it
  const jy = L[1] - 30, jx0 = L[0] - LR[0] - 40;
  let jEnd = jx0;
  for (let k = 0; k <= 6; k++) { const x = jx0 + k * TILE, i = at(x, jy); if (k > 1 && m.tiles[i] !== T.WATER) break; for (const o of [-16, 16]) { const j = at(x, jy + o); if (m.tiles[j] === T.WATER || m.tiles[j] === T.GRASS) { m.tiles[j] = T.DOCK; m.reserve[j] |= RES; } } jEnd = x; }
  if (jEnd > jx0) H.addProp(m, 'pier', Math.round((jx0 + jEnd) / 2 + 16), Math.round(jy), 0, { len: Math.round(jEnd - jx0 + 32) });
  H.addProp(m, 'canoe', Math.round(jEnd - 20), Math.round(jy + 46), 0, { a: 0.1, c: 2 });
  for (const [fx, fy, t] of [[0.2, -0.3, 'duck'], [0.26, -0.22, 'duck'], [-0.1, 0.35, 'swan'], [0.45, 0.4, 'heron']]) H.addProp(m, t, Math.round(L[0] + fx * LR[0] * 2), Math.round(L[1] + fy * LR[1] * 2), 0, { a: hash2(Math.round(fx * 100), 3, 974) * 6.28 });
  // the barn and its yard north-west of the bridge: the barn solid (wall tiles), hay bales, a hay wagon's worth
  const B = P(-330, -200), bw = 7 * TILE, bd = 5 * TILE, btx = Math.floor((B[0] - bw / 2) / TILE), bty = Math.floor((B[1] - bd) / TILE);
  let barn = null;
  { let ok = true; for (let y = bty - 1; y <= bty + 5 && ok; y++) for (let x = btx - 1; x <= btx + 7; x++) { const t = m.tiles[y * MAP_W + x]; if (t !== T.GRASS && t !== T.DIRT && t !== T.SAND) { ok = false; break; } }
    if (ok) { for (let y = bty; y < bty + 5; y++) for (let x = btx; x < btx + 7; x++) { const i = y * MAP_W + x; m.tiles[i] = T.WALL; m.reserve[i] |= RES; } barn = { tx: btx, ty: bty, tw: 7, th: 5 }; clearArea(B[0], B[1] - bd / 2, 200); }
  }
  if (barn) {
    for (let y = bty + 5; y < bty + 9; y++) for (let x = btx - 1; x < btx + 8; x++) { const i = y * MAP_W + x; if (m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
    for (const [dx, dy] of [[-30, 40], [0, 54], [30, 40], [150, 30], [180, 44]]) H.addProp(m, 'hayBale', Math.round(B[0] - bw / 2 + 40 + dx), Math.round(B[1] + dy), 10);
    H.addProp(m, 'wheelbarrow', Math.round(B[0] + bw / 2 + 30), Math.round(B[1] + 20), 0);
  }
  // the pasture south-east of the bridge: a fenced paddock with a trough (the livestock come here)
  const PX = P(420, 290), pw = 12 * TILE, ph = 8 * TILE, ptx = Math.floor((PX[0] - pw / 2) / TILE), pty = Math.floor((PX[1] - ph / 2) / TILE);
  let pasture = null;
  { let ok = true; for (let y = pty - 1; y <= pty + 9 && ok; y++) for (let x = ptx - 1; x <= ptx + 13; x++) { const i = y * MAP_W + x, t = m.tiles[i]; if ((t !== T.GRASS && t !== T.DIRT && t !== T.SAND) || wet.has(i)) { ok = false; break; } }
    if (ok) {
      const x0 = ptx * TILE, y0 = pty * TILE;
      for (let y = pty; y < pty + 8; y++) for (let x = ptx; x < ptx + 12; x++) { const i = y * MAP_W + x; m.tiles[i] = T.GRASS; m.reserve[i] |= RES | LUSH | 16; }   // (16: grazed short - no cover)
      clearArea(x0 + pw / 2, y0 + ph / 2, 260);
      for (const [ax, ay, bx, by] of [[x0, y0, x0 + pw, y0], [x0, y0, x0, y0 + ph], [x0 + pw, y0, x0 + pw, y0 + ph], [x0, y0 + ph, x0 + pw * 0.42, y0 + ph], [x0 + pw * 0.58, y0 + ph, x0 + pw, y0 + ph]]) {
        H.addProp(m, 'rail', ax, ay, 0, { tx: bx - ax, ty: by - ay });
        const LL = Math.hypot(bx - ax, by - ay);
        for (let k = 0; k <= LL; k += 16) m.addSolidProp(ax + (bx - ax) * k / LL, ay + (by - ay) * k / LL, 7);
      }
      H.addProp(m, 'trough', x0 + pw - 70, y0 + 50, 10);
      pasture = { x: Math.round(x0 + pw / 2), y: Math.round(y0 + ph / 2) };
      m.natureSites.push({ kind: 'pasture', name: 'Willow River Pasture', ...pasture });
    }
  }
  // the corn patch beyond the pasture (crop rows: field tiles that are nobody's job)
  { const [cx, cy] = P(830, 330); for (let y = Math.floor((cy - 110) / TILE); y <= Math.floor((cy + 110) / TILE); y++) for (let x = Math.floor((cx - 150) / TILE); x <= Math.floor((cx + 150) / TILE); x++) { const i = y * MAP_W + x; if ((m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) && !wet.has(i) && !(m.reserve[i] & LUSH)) { m.tiles[i] = T.FIELD; m.reserve[i] |= RES; } } clearArea(cx, cy, 200); }
  // on the map and in the debug teleport
  (m.landmarks ||= []).push({ name: 'Willow River Falls', type: 'falls', x: Math.round(F[0] - 420), y: Math.round(F[1] - 260), w: 840, h: 640 });
  (m.landmarks ||= []).push({ name: 'Willow Lake', type: 'lake', x: Math.round(L[0] - LR[0]), y: Math.round(L[1] - LR[1]), w: LR[0] * 2, h: LR[1] * 2 });
  const cliffs = [[CL0, 150 - 66], [150 + 66, CL1]].map(([a, b], k) => { const [x, y] = P((a + b) / 2, -742); return { x: Math.round(x), y: Math.round(y), len: Math.round(b - a), h: k ? 78 : 70, seed: 21 + k }; });
  m.natureSites.push({
    kind: 'river', name: 'Willow River', x: Math.round(C.x), y: Math.round(C.y),
    bridge: { x: C.x, y: C.y, a: C.a, half: span, roadHw: RW },
    falls: { x: F[0], y: F[1] + 30, w: 128, drop: 74 }, cliffs, pool: { x: pool[0], y: pool[1] },
    lake: { x: L[0], y: L[1], rx: LR[0], ry: LR[1] }, barn, pasture, water: fresh.length,
  });
}

// ---- Granite Cove (Granite Peaks, below the campground; concept L9) ---------------------------------------------
// A little sandy cove bitten into the rocky south-west coast: granite cliffs round the back and down both sides to
// the water, wooden steps with rope rails down the cliff from a trail off the campground road, a beach bar shack
// with a striped awning against the cliff, an outdoor shower on a plank deck, a driftwood shade, towels and
// umbrellas on the sand, driftwood at the tide line, boulders at the headlands' feet. Agaves, ice plant and
// flowering shrubs along the cliff top; a map board at the top of the steps.
function graniteCove(m, H) {
  const CX = 555, CY = 225;                                   // the bay's centre (tiles)
  const camp = (m.landmarks || []).find((l) => l.name === 'Granite Cove Campground');
  if (!camp || m.dist[CY * MAP_W + CX] !== 33) return;
  const set = (tx, ty, t, extra = 0) => { const i = ty * MAP_W + tx; if (KEEP.has(m.tiles[i])) return; m.tiles[i] = t; m.reserve[i] |= RES | extra; if (t === T.WATER) { m.land[i] = 0; m.river[i] = 0; m.lake[i] = 0; } else m.land[i] = 1; };
  const e = (tx, ty, cx, cy, rx, ry) => ((tx + 0.5 - cx) / rx) ** 2 + ((ty + 0.5 - cy) / ry) ** 2;
  // anything the map had put here goes (the wilds' trees come later and keep off reserved ground)
  m.props.forEach((p, i) => { if (p && p.t !== 'painted' && Math.abs(p.x / TILE - CX) < 16 && p.y / TILE > CY - 16 && p.y / TILE < CY + 10) dropProp(m, i); });
  for (let ty = CY - 14; ty <= CY + 10; ty++) for (let tx = CX - 15; tx <= CX + 15; tx++) {
    const i = ty * MAP_W + tx, t = m.tiles[i];
    if (KEEP.has(t)) continue;
    const bay = e(tx, ty, CX, CY + 4.6, 6.8, 5.8), beach = e(tx, ty, CX, CY, 10, 9), rim = e(tx, ty, CX, CY + 0.5, 12.6, 11.6);
    if (bay <= 1 && ty >= CY - 2) set(tx, ty, T.WATER);                                     // the bay, open to the sea
    else if (beach <= 1 && ty >= CY - 8 && t !== T.DEEP && t !== T.WATER) set(tx, ty, T.SAND, 4);   // the beach (4 + 32: sand, not rock shore)
    else if (rim <= 1 && t !== T.WATER && t !== T.DEEP) {                                 // the cliffs round it
      if (Math.abs(tx + 0.5 - (CX + 0.5)) < 1.2 && ty < CY - 5) set(tx, ty, T.DIRT);       // (the gap the steps go up)
      else set(tx, ty, T.WALL);
    } else if (rim <= 1.5 && (t === T.GRASS || t === T.DIRT || t === T.SAND)) m.reserve[i] |= RES;   // the cliff top kept clear of the wilds
  }
  const P = (tx, ty) => [Math.round(tx * TILE), Math.round(ty * TILE)];
  // the cliffs: granite bands round the back (their faces to the beach) and down the sides; boulders at their feet
  const cliffs = [[CX - 4.6, CY - 7.6, 7, 4.2, 74, 41], [CX + 5.6, CY - 7.2, 7, 4.2, 82, 42], [CX - 9.6, CY - 2.2, 4.4, 5.6, 64, 43], [CX + 10.6, CY - 1.4, 4.4, 5.8, 70, 44], [CX - 10.8, CY + 4.4, 3.4, 4, 48, 45], [CX + 11.6, CY + 5.2, 3.4, 4, 52, 46]];
  for (const [tx, ty, w, d, h, sd] of cliffs) { const [x, y] = P(tx, ty); H.addProp(m, 'cliff', x, y, 0, { w: Math.round(w * TILE), d: Math.round(d * TILE), h, s: sd }); }
  for (const [tx, ty, r] of [[CX - 7.6, CY + 6.4, 18], [CX + 8.4, CY + 7.6, 16], [CX - 8.8, CY + 8.8, 22], [CX + 9.6, CY + 9.6, 20], [CX - 5.6, CY + 9.2, 12], [CX + 6.2, CY + 10.4, 14]]) { const [x, y] = P(tx, ty); H.addProp(m, 'boulder', x, y, r, { s: r * 2 + 6 }); }
  // the steps up the cliff in the gap, from the sand to the top; a map board up there and a trail to the campground road
  const stepFoot = P(CX + 0.5, CY - 4.6), stepTop = P(CX + 0.5, CY - 10.2);
  H.addProp(m, 'stairs', stepFoot[0], stepFoot[1], 0, { len: stepFoot[1] - stepTop[1], h: 76, w: 30 });
  const road = (m.roads || []).find((r) => /Granite Cove Campground Road/.test(r.name || ''));
  const end = road ? road.pts.reduce((a, q) => (q.y > a.y ? q : a), road.pts[0]) : { x: (CX + 5) * TILE, y: (CY - 34) * TILE };
  trail(m, [[stepTop[0], stepTop[1] - 20], [stepTop[0] + 60, stepTop[1] - 200], [end.x, end.y + 40]]);
  H.addProp(m, 'mapboard', stepTop[0] - 52, stepTop[1] - 30, 0);
  H.addProp(m, 'fingerpost', stepTop[0] + 46, stepTop[1] - 40, 0);
  // the cliff top: agaves, ice plant and flowering shrubs along the edge
  for (let k = 0; k < 26; k++) {
    const a = Math.PI * (1.08 + 0.84 * k / 25), r = 12.9 + hash2(k, 1, 981) * 2.2, tx = CX + 0.5 + Math.cos(a) * r * 1.05, ty = CY + 0.5 + Math.sin(a) * r;
    const i = Math.floor(ty) * MAP_W + Math.floor(tx);
    if (m.tiles[i] !== T.GRASS && m.tiles[i] !== T.DIRT) continue;
    const sp = ['agave', 'agave', 'icePlant', 'hibiscus', 'bougain', 'agave', 'yucca'][Math.floor(hash2(k, 2, 982) * 7)];
    H.addProp(m, 'shrub_a', Math.round(tx * TILE), Math.round(ty * TILE), 0, { sp, k: 1.1 + hash2(k, 3, 983) * 0.3 });
  }
  // on the sand: the beach bar against the east cliff, the shower beside it, the driftwood shade at the west end,
  // towels and umbrellas, a cooler and a surfboard by the bar, driftwood at the tide line
  const bar = P(CX + 4.6, CY - 4.6);
  H.addProp(m, 'beachbar', bar[0], bar[1], 26);
  H.addProp(m, 'surfboard', bar[0] + 66, bar[1] - 20, 0, { v: 1 });
  H.addProp(m, 'cooler', bar[0] - 64, bar[1] + 16, 0, { v: 1 });
  const sh = P(CX + 7.4, CY - 2.2); H.addProp(m, 'shower', sh[0], sh[1], 0);
  const ds = P(CX - 5.0, CY - 3.8); H.addProp(m, 'driftshade', ds[0], ds[1], 0, { w: 74, d: 52 });
  H.addProp(m, 'towel', ds[0] - 4, ds[1] - 16, 0, { v: 2 });
  for (const [dx, dy, v] of [[-2.4, -2.6, 0], [-0.8, -2.2, 1], [1.4, -2.0, 3], [3.4, -2.6, 2]]) { const [x, y] = P(CX + 0.5 + dx, CY + dy); H.addProp(m, 'towel', x, y, 0, { v }); }
  for (const [dx, dy, t] of [[0.2, -3.0, 'umbrella_g'], [2.6, -3.2, 'umbrella_r'], [-3.4, -3.4, 'umbrella_y']]) { const [x, y] = P(CX + 0.5 + dx, CY + dy); H.addProp(m, t, x, y, 4); }
  for (const [dx, dy, a] of [[-4.4, -1.0, 0.3], [4.6, -1.2, -0.4], [6.4, 0.6, 0.9]]) { const [x, y] = P(CX + 0.5 + dx, CY + dy); H.addProp(m, 'driftwood', x, y, 0, { a, len: 50 + hash2(Math.round(dx * 10), 4, 984) * 30 }); }
  for (const [dx, dy] of [[-1.6, -4.4], [1.8, -4.6]]) { const [x, y] = P(CX + 0.5 + dx, CY + dy); H.addProp(m, 'chair', x, y, 0, { v: 1, a: Math.PI / 2 }); }
  // on the map and in the debug teleport
  (m.landmarks ||= []).push({ name: 'Granite Cove', type: 'cove', x: (CX - 13) * TILE, y: (CY - 13) * TILE, w: 27 * TILE, h: 24 * TILE });
  m.natureSites.push({ kind: 'cove', name: 'Granite Cove', x: (CX + 0.5) * TILE, y: CY * TILE, bar: { x: bar[0], y: bar[1] }, steps: { x: stepFoot[0], y0: stepTop[1], y1: stepFoot[1] } });
}

// ---- Lakeview Park (concept D11) ------------------------------------------------------------------------------
// The park's grid of straight paths gives way to the D11 park: paths that wander between the lawns and meet at the
// fountain plaza, a duck pond in two lobes with an arched timber footbridge over its neck, weeping willows round it,
// reeds and lily pads; a gazebo on its own little round in the east lawns, a statue in a ring of roses, a food cart
// under a striped umbrella by the plaza, picnic blankets on the grass, groves of big shade trees and blossom, flower
// beds along the paths, benches facing the paths and lamps along them, a park sign at each gate.
function lakeviewPark(m, H) {
  const park = (m.blocks || []).find((b) => b.park && b.park.label === 'Lakeview Park');
  if (!park) return;
  const { ix, iy, iw, ih } = park, cx = ix + Math.floor(iw / 2), cy = iy + Math.floor(ih / 2);
  const inPark = (tx, ty) => tx >= ix && tx < ix + iw && ty >= iy && ty < iy + ih;
  const P = (tx, ty) => [Math.round((tx + 0.5) * TILE), Math.round((ty + 0.5) * TILE)];
  const add = (t, tx, ty, r = 0, extra = null) => { const [x, y] = P(tx, ty); H.addProp(m, t, x, y, r, extra); };
  // the random dressing and the ring path's lamps go (the fountain, its benches and the courier counter stay)
  const RANDOM = new Set(['tree_a', 'tree_b', 'shrub_a', 'flowers_a', 'flowers_big', 'mosaic', 'lamp']);
  m.props.forEach((p, i) => { if (p && RANDOM.has(p.t) && inPark(Math.floor(p.x / TILE), Math.floor(p.y / TILE))) dropProp(m, i); });
  const plaza = (tx, ty) => Math.abs(tx + 0.5 - cx) <= 4 && Math.abs(ty + 0.5 - cy) <= 4;
  for (let ty = iy; ty < iy + ih; ty++) for (let tx = ix; tx < ix + iw; tx++) {
    const i = ty * MAP_W + tx;
    m.reserve[i] |= RES;
    if (m.tiles[i] === T.PLAZA && !plaza(tx, ty)) m.tiles[i] = T.GRASS;   // (the straight paths)
  }
  // the paths: 2 tiles wide, wandering from each gate to the plaza, a loop round the pond and one through the east lawns
  const path = (cp) => { for (const [x, y] of spline(cp.map(([tx, ty]) => [(tx + 0.5) * TILE, (ty + 0.5) * TILE]), 12)) paint(m, x, y, 30, T.PLAZA, (t) => t === T.GRASS); };
  const W = ix, E = ix + iw - 1, N = iy, S = iy + ih - 1;
  path([[W, cy - 0.5], [W + 7, cy - 2], [W + 15, cy - 5], [cx - 13, cy - 6], [cx - 6, cy - 2], [cx - 4, cy - 0.5]]);                 // west gate
  path([[E - 8, cy + 2], [E - 18, cy + 4], [cx + 12, cy + 4], [cx + 6, cy + 1.5], [cx + 4, cy]]);                               // the east lawns (the railway behind them: no gate)
  path([[cx - 0.5, N], [cx - 2.5, N + 5], [cx + 0.5, N + 9], [cx - 0.5, cy - 4]]);                                                    // north gate
  path([[cx - 0.5, S], [cx + 2.5, S - 5], [cx - 0.5, S - 9], [cx - 0.5, cy + 4]]);                                                    // south gate
  path([[W + 15, cy - 5], [W + 9, cy - 11], [W + 20, cy - 13], [cx - 9, cy - 10], [cx - 4, cy - 4]]);                                // round the pond's north
  path([[W + 7, cy - 2], [W + 6, cy + 6], [W + 14, cy + 12], [cx - 12, cy + 12], [cx - 4, cy + 4]]);                                 // round its south
  path([[cx + 4, cy - 4], [cx + 12, cy - 10], [E - 16, cy - 12], [E - 8, cy - 6], [E - 8, cy + 2]]);                                 // east lawns, north loop
  path([[cx + 12, cy + 4], [cx + 16, cy + 11], [E - 14, cy + 13], [E - 8, cy + 2]]);                                                  // and south
  // the duck pond: two lobes and a neck between the west paths, deep in the middle of each lobe
  const lobes = [[W + 14, cy - 5.5, 7.5, 4.2], [cx - 15, cy + 6, 7, 4.2]];   // (the south lobe clear of the bridge's rows: both ends land on grass)
  for (let ty = iy + 2; ty < iy + ih - 2; ty++) for (let tx = ix + 2; tx < cx - 4; tx++) {
    let q = 9;
    for (const [lx, ly, rx, ry] of lobes) q = Math.min(q, ((tx + 0.5 - lx) / rx) ** 2 + ((ty + 0.5 - ly) / ry) ** 2);
    const neck = Math.abs((tx + 0.5) - (W + 14 + cx - 15) / 2) < 3.2 && ty + 0.5 > cy - 3 && ty + 0.5 < cy + 3;
    if (q > 1 && !neck) continue;
    const i = ty * MAP_W + tx;
    m.tiles[i] = q < 0.4 ? T.DEEP : T.WATER;
  }
  // the bridge over the neck (planks underneath: you walk it), east-west
  const BX = (W + 14 + cx - 15) / 2, BY = cy - 1;
  for (let tx = Math.floor(BX - 4); tx <= Math.ceil(BX + 4); tx++) for (const ty of [Math.floor(BY), Math.floor(BY) + 1]) { const i = ty * MAP_W + tx; if (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) m.tiles[i] = T.DOCK; else if (m.tiles[i] === T.GRASS) m.tiles[i] = T.PLAZA; }
  add('archbridge', BX, BY + 0.5, 0, { len: 9 * TILE });
  path([[BX - 5, BY + 0.5], [BX - 9, BY - 1], [W + 7, cy - 2]]); path([[BX + 5, BY + 0.5], [BX + 9, BY], [cx - 6, cy - 2]]);
  // round the pond: willows, rocks, reeds and cattails at the edge, lily pads and ducks on it
  const lawn3 = (tx, ty) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (m.tiles[(Math.floor(ty) + dy) * MAP_W + Math.floor(tx) + dx] !== T.GRASS) return false; return true; };
  lobes.forEach(([lx, ly, rx, ry], j) => { for (const a of j ? [0.5, 1.6, 2.6, 5.6] : [2.4, 3.3, 4.3, 5.1]) { const tx = lx + Math.cos(a) * (rx + 1.7), ty = ly + Math.sin(a) * (ry + 1.5); if (lawn3(tx, ty)) add('tree_a', tx, ty, 12, { sp: 'willow', k: 1.45 }); } });
  let e = 0;
  for (let ty = iy + 2; ty < iy + ih - 2; ty++) for (let tx = ix + 2; tx < cx - 4; tx++) {
    const i = ty * MAP_W + tx;
    if (m.tiles[i] !== T.GRASS) continue;
    const wet = [i - 1, i + 1, i - MAP_W, i + MAP_W].some((j) => m.tiles[j] === T.WATER || m.tiles[j] === T.DEEP);
    if (!wet) continue;
    const h = hash2(tx, ty, 991);
    if (h < 0.28) add('shrub_a', tx + hash2(tx, ty, 992) * 0.4 - 0.2, ty, 0, { sp: h < 0.14 ? 'cattails' : 'reeds', k: 1 });
    else if (h > 0.72 && e++ < 26) add('boulder', tx + (hash2(tx, ty, 998) - 0.5) * 0.5, ty + (hash2(ty, tx, 998) - 0.5) * 0.5, 0, { s: 9 + Math.round((h - 0.72) * 30) });   // (stones set round the edge)
    else if (h > 0.5 && h < 0.58) add('shrub_a', tx, ty, 0, { sp: h < 0.54 ? 'hydrangea' : 'berryShrub', k: 0.9 });
  }
  for (const [lx, ly] of lobes) { for (let j = 0; j < 5; j++) add('lily', lx - 3 + j * 1.6, ly + (j % 2 ? 1.6 : -1.4), 0, { v: j % 4 }); add('duck', lx + 1, ly - 0.6, 0, { a: 0.4 }); add('duck', lx + 2.2, ly - 0.2, 0, { a: 0.6 }); }
  add('swan', lobes[1][0] - 2, lobes[1][1] + 1, 0, { a: 2.6 });
  // the gazebo on its round in the east lawns' north, the statue in its ring of roses to the south
  const GZ = [E - 16, cy - 7], ST = [E - 18, cy + 8];
  for (const [c, r] of [[GZ, 3.2], [ST, 3.4]]) { const [x, y] = P(c[0], c[1]); paint(m, x, y, r * TILE, T.PLAZA, (t) => t === T.GRASS); }
  add('gazebo', GZ[0], GZ[1] + 1.1, 30);
  add('statue', ST[0], ST[1], 8);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; add('shrub_a', ST[0] + Math.cos(a) * 4.4, ST[1] + Math.sin(a) * 3.8, 0, { sp: k % 2 ? 'rose' : 'hydrangea', k: 1.1 }); }
  // by the plaza: the food cart under a striped umbrella, a chalkboard; picnic blankets out on the east lawn
  add('foodcart', cx + 6, cy + 3.2, 10); add('umbrella_r', cx + 7.6, cy + 3.6, 4);
  for (const [dx, dy, v] of [[10, -3, 0], [15, -1, 1], [12, 8, 0]]) { add('blanket', cx + dx, cy + dy, 0, { v }); add('cooler', cx + dx + 1.3, cy + dy - 0.5, 0, { v: v + 1 }); }
  // trees: groves of big shade trees and blossom on the lawns (clear of the paths and the plaza)
  const treeOk = (tx, ty) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = m.tiles[(Math.floor(ty) + dy) * MAP_W + Math.floor(tx) + dx]; if (t !== T.GRASS) return false; } return true; };
  const groves = [[W + 4, N + 3, 'oak'], [W + 3, S - 3, 'maple'], [cx - 7, N + 3, 'oak'], [cx + 8, N + 3, 'maple'], [cx + 7, S - 3, 'oak'], [E - 4, N + 4, 'magnolia'], [E - 4, S - 4, 'oak'], [cx + 13, cy - 2, 'cherry'], [cx - 22, S - 2, 'cherry']];
  const trees = [];
  const plant = (tx, ty, sp, k) => { if (!inPark(Math.floor(tx), Math.floor(ty)) || !treeOk(tx, ty) || trees.some(([x, y]) => Math.hypot(x - tx, y - ty) < 2.6)) return; trees.push([tx, ty]); add('tree_a', tx, ty, 12, { sp, k }); };
  for (const [gx, gy, sp] of groves) for (let k = 0; k < 7; k++) {
    const tx = gx + (hash2(gx, k, 993) - 0.5) * 10, ty = gy + (hash2(gy, k, 994) - 0.5) * 5;
    plant(tx, ty, k === 3 && sp !== 'cherry' ? 'flowerTree' : sp, 1.35 + hash2(gx, k, 995) * 0.25);
  }
  // and a ring of big trees just inside the railings, screening the streets (gaps where the paths come in)
  const RING = ['oak', 'maple', 'oak', 'redMaple', 'oak', 'birch'];
  for (let k = 0, d = 0; d < 2 * (iw + ih) - 8; k++, d += 4.2 + hash2(k, 3, 999) * 2.4) {
    const side = d < iw - 3 ? 0 : d < iw + ih - 6 ? 1 : d < 2 * iw + ih - 9 ? 2 : 3;
    const u = side === 0 ? d : side === 1 ? d - (iw - 3) : side === 2 ? d - (iw + ih - 6) : d - (2 * iw + ih - 9);
    const tx = side === 0 ? ix + 2 + u : side === 2 ? ix + iw - 2 - u : side === 1 ? ix + iw - 2.2 : ix + 1.8;
    const ty = side === 1 ? iy + 2 + u : side === 3 ? iy + ih - 2 - u : side === 0 ? iy + 1.8 : iy + ih - 2.2;
    plant(tx + (hash2(k, 1, 999) - 0.5) * 0.8, ty + (hash2(k, 2, 999) - 0.5) * 0.8, RING[k % RING.length], 1.3 + hash2(k, 4, 999) * 0.3);
  }
  // along the paths: flower beds, benches facing the path, lamps and bins
  const SP = ['rose', 'hydrangea', 'lavender', 'daisies', 'lupines'];
  let nb = 0, nl = 0, nf = 0;
  for (let ty = iy + 1; ty < iy + ih - 1; ty++) for (let tx = ix + 1; tx < ix + iw - 1; tx++) {
    const i = ty * MAP_W + tx;
    if (m.tiles[i] !== T.GRASS) continue;
    const nbr = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => m.tiles[i + dy * MAP_W + dx] === T.PLAZA);
    if (!nbr) continue;
    const h = hash2(tx, ty, 996);
    if (h < 0.05 && nb < 22 && nbr[1]) {   // (benches only beside the east-west runs: they face up or down the screen - seen side-on they read as posts)
      add('pbench', tx, ty, 0, { a: Math.atan2(-nbr[1], -nbr[0]) + Math.PI / 2 }); if (h < 0.012) add('trashcan', tx + 0.9, ty, 0); nb++;
    }
    else if (h > 0.955 && nl < 26) { add('lamp', tx + nbr[0] * 0.4, ty + nbr[1] * 0.4); nl++; }
    else if (h > 0.6 && h < 0.69 && nf < 110) { add('shrub_a', tx, ty, 0, { sp: SP[Math.floor(hash2(tx >> 2, ty >> 2, 997) * SP.length)], k: 1 }); nf++; }
    else if (h > 0.8 && h < 0.83 && !trees.some(([x, y]) => Math.hypot(x - tx, y - ty) < 1.6)) add('shrub_a', tx, ty, 0, { sp: ['hydrangea', 'berryShrub', 'salal', 'topBall'][Math.floor(hash2(tx >> 3, ty >> 3, 990) * 4)], k: 1.1 });   // (shrubs along the edges)
  }
  for (const [tx, ty] of [[W + 1.5, cy - 2.6], [cx + 1.8, N + 1.4], [cx - 2.8, S - 1.4]]) add('parksign', tx, ty, 0);
  (m.landmarks ||= []).push({ name: 'Lakeview Park', type: 'park', x: ix * TILE, y: iy * TILE, w: iw * TILE, h: ih * TILE });
  (m.parkGrounds ||= []).push({ x: ix * TILE, y: iy * TILE, w: iw * TILE, h: ih * TILE, plaza: { x: (cx - 4) * TILE, y: (cy - 4) * TILE, w: 8 * TILE, h: 8 * TILE } });   // (the ground: lawn, gravel paths)
  m.natureSites.push({ kind: 'park', name: 'Lakeview Park', x: cx * TILE, y: cy * TILE, bridge: { x: (BX + 0.5) * TILE, y: (BY + 1) * TILE }, gazebo: P(GZ[0], GZ[1]) });
}
