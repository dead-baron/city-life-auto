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
  redwoodCreek(m, H);
  canyonOasis(m, H);
  lighthouseTidepools(m, H);
  campDressing(m, H);
  beachBonfire(m, H);
  desertCamp(m, H);
  summitTarn(m, H);
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
