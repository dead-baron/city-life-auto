// Dirt-bike country (the nature program, 2026-10-20: Nature-C1, the owner's note of 10-16 - "dirt bike trails and loop
// tracks in the desert and forest, with bikes left there"). World v3's Red Rock Desert gets its motocross park: the Red
// Rock MX Park on the sand flat under Lookout Mesa, off Dusty Hollow Road -
//   - the track: a looping dirt course a few tiles wide (four straights joined by hairpins and the long sweeper back to
//     the start), banked berms round the outside of every tight turn, a tabletop jump on each long straight (a takeoff
//     ramp, a flat top, a landing - m.jumps: the clients lift a bike that rides it over the top and through the air,
//     client/art2/game/host.js), tyre stacks and red-and-white tape along it;
//   - the start gate across the start straight, the timing tower on stilts beside it, floodlight masts round it, a
//     rail fence round the whole park;
//   - a lap race at the gate (m.races: three laps for dirt bikes - server/systems/races.js), its place on the map;
//   - the pits: trailers with their ramps down, a pop-up tent, gear cases, dirt bikes on their stands to take (m.parking:
//     the park's bikes), the riders' pickups; the ticket shack by the gate in from the road, the car park.
// And the long rides (Nature-C1-B):
//   - the Red Rock Trail: a marked two-track out of the park's east gate round Lookout Mesa, up its jeep track to the
//     top and down again, across a boulder-strewn dry wash to a rest stop under the big mesa (a shade ramada over a
//     picnic table, a water tank, a rail fence) and back - numbered markers 1 to 4 at its turns; a riders' camp off
//     marker 2, their dirt bikes and pickup parked by it (2026-10-21; NA1-C's party camp at the trail's end);
//   - in Highland Woods the Highland Enduro: a trailhead car park off Highland Road (the riders' trucks, a map board,
//     the trail's sign) and the single-track loop from it through the pines and over the rocks above the lake - its
//     bermed corners, an upturned root plate, a log ride beside a fallen trunk, a jump line, a creek splash (the
//     creek off the rocks down to the lake: a ford, the water still running over it) and a timber bridge where the
//     creek tumbles over a ledge; dirt bikes left at the trailhead.
// For the whole-world build only (shared/world3-world.js calls buildDirt3 from its done hook). Deterministic: authored
// shapes and integer hashes; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';
import { routeTiles } from './world3-trails.js';
import { camp3, campFits } from './world3-camps.js';

const RES = 32;
export const MX = {
  name: 'Red Rock MX Park', district: 50, near: [5218, 1626], search: 36,
  size: [104, 64],   // (the park's box, tiles: the track's frame inside a 2-tile margin)
  // the course, in the park's frame (tiles from its north-west corner): the start straight along the north, a hairpin
  // into each of three straights back and forth, the long left-hand sweeper up the west side to the start
  loop: [[14, 8], [50, 7], [84, 8], [93, 12], [95, 19], [88, 24], [66, 24], [42, 24], [29, 26], [27, 33], [35, 38], [60, 38], [85, 38], [94, 42], [95, 51], [86, 55], [52, 55], [20, 54], [10, 50], [6, 40], [6, 24], [8, 14]],
  hw: 52,            // (the track's half-width, px)
  laps: 3, prize: 350,
};
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the long rides: their via points (tiles), a closed loop back to the start; markers numbered at the points marked
export const RIDES = [
  { name: 'Red Rock Trail', kind: 'route', district: 50, from: 'mx', hw: 40, slope: 24, lump: 22, wander: 1.6, pts: [[5372, 1694, 1], [5430, 1722], [5401, 1652, 2], [5430, 1722], [5520, 1702], [5584, 1648, 3], [5520, 1702], [5482, 1772, 4], [5340, 1726]],
    wash: { pts: [[5508, 1650], [5522, 1690], [5516, 1730], [5534, 1772]], hw: 3 }, rest: 3, camp: 2 },
  { name: 'Highland Enduro', kind: 'enduro', district: 47, start: [978, 1338], hw: 24, slope: 40, lump: 14, wander: 0.8, pts: [[1012, 1302], [1068, 1282], [1090, 1226], [1050, 1186], [1000, 1208], [986, 1262]],
    creek: { pts: [[982, 1232], [1030, 1246], [1075, 1240], [1120, 1255], [1176, 1262]], hw: 1.6 } },
];
export function buildDirt3(m, H3) {
  const out = { mx: null, rides: [], missed: [] };
  if (!H3 || !H3.addProp) return out;
  out.mx = mxPark(m, H3, out);
  for (const R of RIDES) { const r = ride(m, H3, R, out); if (r) out.rides.push(r); }
  return out;
}

function mxPark(m, H3, out) {
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const [BW, BH] = MX.size;
  const open = (i) => m.land[i] && !m.reserve[i] && m.dist[i] === MX.district && (m.tiles[i] === T.SAND || m.tiles[i] === T.DIRT || m.tiles[i] === T.GRASS) && (m.bld ? m.bld[i] < 0 : true);
  const isRoad = (t) => t === T.ROAD;
  // 1. the site: the park's box all open desert ground, level (the relief within a few metres), a road along its north
  // side a few tiles off (the way in), nearest the planned spot
  let best = null;
  for (let oy = MX.near[1] - MX.search; oy <= MX.near[1] + MX.search; oy += 2) for (let ox = MX.near[0] - MX.search; ox <= MX.near[0] + MX.search; ox += 2) {
    let ok = true, lo = 1e9, hi = -1e9;
    for (let y = oy; y < oy + BH && ok; y += 2) for (let x = ox; x < ox + BW; x += 2) { if (!inF(x, y) || !open(idx(x, y))) { ok = false; break; } const r = m.relief ? m.relief[idx(x, y)] : 0; lo = Math.min(lo, r); hi = Math.max(hi, r); }
    if (!ok || hi - lo > 6) continue;
    let road = -1;
    for (let d = 1; d <= 16 && road < 0; d++) for (let x = ox + 20; x < ox + 60; x += 2) if (inF(x, oy - d) && isRoad(m.tiles[idx(x, oy - d)])) { road = d; break; }
    if (road < 0) continue;
    const sc = Math.hypot(ox - MX.near[0], oy - MX.near[1]) + road * 2 + (hi - lo);
    if (!best || sc < best.sc) best = { ox, oy, road, sc };
  }
  if (!best) { out.missed.push('the MX park: no site'); return null; }
  const { ox, oy } = best, X = (x) => (ox + x) * TILE, Y = (y) => (oy + y) * TILE;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = new Set();
  // the ground: the park's growth goes, nothing else built on it
  for (const p of m.props) if (p && p.x >= X(-1) && p.x < X(BW + 1) && p.y >= Y(-1) && p.y < Y(BH + 1) && p.t !== 'painted') drop.add(p.x + ',' + p.y);
  for (let y = oy - 1; y < oy + BH + 1; y++) for (let x = ox - 1; x < ox + BW + 1; x++) if (inF(x, y)) m.reserve[idx(x, y)] |= RES;
  // 2. the track: the loop rounded (Chaikin three times, closed), dirt under it, a dirt track for the bake
  let L = MX.loop.map(([x, y]) => [X(x) + 16, Y(y) + 16]);
  for (let r = 0; r < 3; r++) { const q = []; for (let k = 0; k < L.length; k++) { const [x0, y0] = L[k], [x1, y1] = L[(k + 1) % L.length]; q.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); } L = q; }
  // resampled every 16 px, closed; each sample's heading and how hard it turns there
  const S = [];
  for (let k = 0; k < L.length; k++) {
    const [x0, y0] = L[k], [x1, y1] = L[(k + 1) % L.length], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / 16));
    for (let j = 0; j < n; j++) S.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n]);
  }
  const N = S.length, head = (k) => { const a = S[(k + N - 2) % N], b = S[(k + 2) % N]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const turn = (k) => { let d = head((k + 3) % N) - head((k + N - 3) % N); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };   // (radians over six samples: + to the right on screen)
  for (const [x, y] of S) for (let ty = Math.floor((y - MX.hw) / TILE); ty <= Math.floor((y + MX.hw) / TILE); ty++) for (let tx = Math.floor((x - MX.hw) / TILE); tx <= Math.floor((x + MX.hw) / TILE); tx++) {
    if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > MX.hw) continue;
    const i = idx(tx, ty); if (m.land[i]) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; }
  }
  const pts = S.filter((_, k) => k % 2 === 0).map(([x, y]) => [Math.round(x), Math.round(y)]); pts.push(pts[0]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  (m.tracks ||= []).push({ pts, hw: MX.hw, bb: [Math.min(...xs) - 64, Math.min(...ys) - 64, Math.max(...xs) + 64, Math.max(...ys) + 64], mx: 1 });
  // 3. the berms round the outsides of the tight turns, tyre stacks behind them; tape along the straights' edges
  let berms = 0, tables = 0;
  for (let k = 0; k < N; k += 2) {
    const t = turn(k), a = head(k), nx = -Math.sin(a), ny = Math.cos(a);   // (n: to the right of the way round)
    if (Math.abs(t) > 0.32) {
      const side = t > 0 ? -1 : 1;   // (turning right: the outside is on the left)
      const [x, y] = S[k], bx = x + nx * side * (MX.hw + 14), by = y + ny * side * (MX.hw + 14);
      P('berm', bx, by, 0, { len: 48, a: Math.round(a * 1000) / 1000, side, h: Math.round(10 + Math.min(1, Math.abs(t) / 0.9) * 12) }); berms++;
      if (k % 8 === 0) P('tires', x + nx * side * (MX.hw + 56), y + ny * side * (MX.hw + 56), 10);
    } else if (Math.abs(t) < 0.12 && k % 8 === 0) {
      for (const side of [-1, 1]) P('tapeline', S[k][0] + nx * side * (MX.hw + 18), S[k][1] + ny * side * (MX.hw + 18), 0, { len: 128, a: Math.round(a * 1000) / 1000 });
    }
  }
  // 4. the tabletops: on each long straight (36 samples - 18 tiles - without a turn), in its middle; never the start's
  const jumps = (m.jumps ||= []);
  const straight = [];
  for (let k = 0; k < N; k++) straight.push(Math.abs(turn(k)) < 0.14);
  const startK = 0;
  for (let k = 0; k < N; k++) {
    if (!straight[k] || straight[(k + N - 1) % N]) continue;
    let n = 0; while (n < N && straight[(k + n) % N]) n++;
    if (n < 36) continue;
    const mid = (k + (n >> 1)) % N;
    if (Math.min(Math.abs(mid - startK), N - Math.abs(mid - startK)) < 30) continue;   // (the start straight: the gate)
    const [x, y] = S[mid], a = Math.round(head(mid) / (Math.PI / 8)) * (Math.PI / 8), len = 13 * TILE;   // (its heading one of sixteen: as the art draws it)
    const J = { x: Math.round(x), y: Math.round(y), a: Math.round(a * 1000) / 1000, len, w: MX.hw * 2 + 8, h: 30, ramp: 4 * TILE, kind: 'table', name: MX.name };
    jumps.push(J);
    P('tabletop', x, y, 0, { len, w: J.w, h: J.h, ramp: J.ramp, a: J.a });
    tables++;
  }
  // 5. the start gate across the start straight, the timing tower beside it, the floodlights round the course
  const g0 = S[startK + 6], ga = head(startK + 6), gnx = -Math.sin(ga), gny = Math.cos(ga);
  P('startgate', g0[0], g0[1], 0, { w: MX.hw * 2 + 16, a: Math.round(ga * 1000) / 1000 });
  const tw = S[startK + 26], ta = head(startK + 26);   // (the tower a little way down the start straight, north of it: clear of the way in)
  P('timingtower', tw[0] + Math.sin(ta) * (MX.hw + 110), tw[1] - Math.cos(ta) * (MX.hw + 110), 30);
  P('textsign', g0[0] + gnx * -(MX.hw + 200), g0[1] + gny * -(MX.hw + 200) + 40, 0, { text: 'RED ROCK MX', bg: '#a8341e', fg: [250, 236, 200], z: 36 });
  for (const [fx, fy] of [[1, 1], [BW - 2, 1], [1, BH - 2], [BW - 2, BH - 2], [BW >> 1, BH - 2]]) P('floodmast', X(fx) + 16, Y(fy) + 16, 12);
  // 6. the rail fence round the park (a gap in the north side for the way in), the pits to the south-west, the ticket
  // shack and the car park by the way in
  const fence = (x0, y0, x1, y1) => P('fenceline', X(x0), Y(y0), 0, { kind: 'wood', tx: (x1 - x0) * TILE, ty: (y1 - y0) * TILE });
  const gate = 30;   // (the way in: tiles from the west end of the north side)
  fence(0, 0, gate - 3, 0); fence(gate + 4, 0, BW, 0); fence(0, 0, 0, BH); fence(BW, 0, BW, BH); fence(0, BH, BW, BH);
  // the way in: dirt from the road down to the gap, the car park inside it
  for (let y = oy - best.road; y <= oy + 2; y++) for (let x = ox + gate - 2; x <= ox + gate + 2; x++) if (inF(x, y)) { const i = idx(x, y); if (m.land[i] && m.tiles[i] !== T.ROAD && m.tiles[i] !== T.BRIDGE) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
  const way = [[X(gate) + 16, Y(-best.road) + 16], [X(gate) + 16, Y(2) + 16]];
  (m.tracks ||= []).push({ pts: way.map(([x, y]) => [Math.round(x), Math.round(y)]), hw: 70, bb: [way[0][0] - 80, way[0][1] - 80, way[1][0] + 80, way[1][1] + 80] });
  P('boxoffice', X(gate + 6), Y(1) + 8, 30);
  P('textsign', X(gate - 6), Y(1), 0, { text: 'MX PARK', bg: '#a8341e', fg: [250, 236, 200], z: 30 });
  // the pits: along the south side between the course and the fence - the trailers with their ramps down, the pop-up
  // tent, gear cases, a chair and a cooler, the bikes on their stands (anyone's to take: m.parking's dirt bikes)
  const pit = [18, 59], PX = X(pit[0]), PY = Y(pit[1]);
  for (let y = oy + pit[1] - 2; y <= oy + pit[1] + 3; y++) for (let x = ox + pit[0] - 2; x <= ox + pit[0] + 44; x++) if (inF(x, y)) { const i = idx(x, y); if (m.tiles[i] === T.SAND || m.tiles[i] === T.GRASS) { m.tiles[i] = T.DIRT; } m.reserve[i] |= RES; }
  P('mxtrailer', PX + 40, PY + 8, 26, { a: 0, c: 0 });
  P('mxtrailer', PX + 230, PY + 8, 26, { a: 0, c: 1 });
  P('canopy', PX + 400, PY + 20, 0, { w: 120, d: 84, h: 48 });
  P('crates', PX + 360, PY + 40, 8); P('crates', PX + 448, PY + 44, 8);
  P('chair', PX + 392, PY + 52, 0, { a: -0.5, v: 1 }); P('cooler', PX + 420, PY + 56, 0, { v: 2 });
  const parking = (m.parking ||= []);
  for (let k = 0; k < 5; k++) parking.push({ x: Math.round(PX + 560 + k * 48), y: Math.round(PY + 24), a: -Math.PI / 2, model: 'dirtbike', mx: 1 });   // (the bikes on their stands, noses to the course)
  for (let k = 0; k < 3; k++) parking.push({ x: Math.round(X(gate + 10 + k * 4)), y: Math.round(Y(2) + 16), a: Math.PI / 2, model: hh(k, 3, 977) < 0.6 ? 'pickup' : 'van', mx: 1 });   // (the riders' trucks by the shack)
  // 7. the race: three laps from the gate, a checkpoint every eighth of the way round
  const lap = [];
  for (let j = 1; j <= 8; j++) { const [x, y] = S[(startK + 6 + Math.round(j * N / 8)) % N]; lap.push({ x: Math.round(x), y: Math.round(y) }); }
  const cps = []; for (let k = 0; k < MX.laps; k++) cps.push(...lap.map((q) => ({ ...q })));
  const race = { id: (m.races ||= []).length, name: MX.name, kind: 'dirt', start: { x: Math.round(g0[0] - Math.cos(ga) * 70), y: Math.round(g0[1] - Math.sin(ga) * 70) }, cps, prize: MX.prize, laps: MX.laps, lapLen: lap.length, where: 'the start gate' };
  m.races.push(race);
  m.pois.push({ id: m.pois.length, kind: 'race', label: race.name, x: race.start.x, y: race.start.y, r: 60 });
  // the park's things in place of what grew there
  if (drop.size && H3.removeProps) H3.removeProps(m, (x, y) => drop.has(x + ',' + y));
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  (m.landmarks ||= []).push({ name: MX.name, type: 'mx', x: X(0), y: Y(0), w: BW * TILE, h: BH * TILE });
  m.natureSites.push({ kind: 'mx', name: MX.name, x: Math.round(X(BW / 2)), y: Math.round(Y(BH / 2)), track: pts.filter((_, k) => k % 4 === 0), pits: { x: Math.round(PX + 120), y: Math.round(PY + 40) } });
  return { at: [ox, oy], samples: N, berms, tables, race: race.id, laps: race.laps };
}

// ---- the long rides (Nature-C1-B) -----------------------------------------------------------------------------------
const VEG = /^(tree_|redwood|shrub_|bush_|flowers_|rwstump|rwlog|log$|fern|gnaw|cactus|palm_)/;
function ride(m, H3, R, out) {
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const wetT = (t) => t === T.WATER || t === T.DEEP;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = new Set();
  const vg = []; for (const p of m.props) if (p && VEG.test(p.t)) vg.push(p);
  const vgrid = new Map(), VC = 8 * TILE;
  for (const p of vg) { const k = Math.floor(p.x / VC) * 65536 + Math.floor(p.y / VC); let a = vgrid.get(k); if (!a) vgrid.set(k, a = []); a.push(p); }
  const clearVeg = (x, y, r) => { for (let cy = Math.floor((y - r) / VC); cy <= Math.floor((y + r) / VC); cy++) for (let cx = Math.floor((x - r) / VC); cx <= Math.floor((x + r) / VC); cx++) for (const p of vgrid.get(cx * 65536 + cy) || []) if (Math.hypot(p.x - x, p.y - y) < r) drop.add(p.x + ',' + p.y); };
  const blocked = new Set();
  for (const p of m.props) { if (!p || VEG.test(p.t) || p.t === 'painted') continue; const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); if (inF(tx, ty)) blocked.add(idx(tx, ty)); }
  // the creek first (the enduro's: off the rocks down to the lake), so the line meets it
  let creek = null;
  if (R.creek) {
    creek = new Set();
    let C = R.creek.pts.map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE]);
    for (let r = 0; r < 2; r++) { const q = [C[0]]; for (let k = 1; k < C.length; k++) { const [x0, y0] = C[k - 1], [x1, y1] = C[k]; q.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); } q.push(C[C.length - 1]); C = q; }
    const hw = R.creek.hw * TILE;
    for (let k = 1; k < C.length; k++) {
      const [x0, y0] = C[k - 1], [x1, y1] = C[k], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
      for (let j = 0; j <= n; j++) {
        const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n, w = hw * (0.8 + 0.4 * hh(Math.floor(x / 64), Math.floor(y / 64), 991));
        for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
          if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
          const i = idx(tx, ty), t = m.tiles[i];
          if (t === T.GRASS || t === T.DIRT || t === T.SAND) { m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES; creek.add(i); }
        }
        clearVeg(x, y, w + 20);
      }
    }
    // the spring it rises from: a little pool, reeds round it; boulders along the rocks
    const [sx, sy] = C[0];
    for (let ty = Math.floor(sy / TILE) - 3; ty <= Math.floor(sy / TILE) + 3; ty++) for (let tx = Math.floor(sx / TILE) - 3; tx <= Math.floor(sx / TILE) + 3; tx++) { if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - sx, (ty + 0.5) * TILE - sy) > 2.8 * TILE) continue; const i = idx(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { m.tiles[i] = T.WATER; m.land[i] = 0; m.river[i] = 1; m.reserve[i] |= RES; creek.add(i); } }
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; P('shrub_a', sx + Math.cos(a) * 3.6 * TILE, sy + Math.sin(a) * 3 * TILE, 0, { sp: k % 2 ? 'reeds' : 'fern', k: 1 }); }
    for (let k = 4; k < C.length - 2; k += 4) { const [x, y] = C[k], s2 = k % 8 ? 1 : -1; P('boulder', x + s2 * (hw + 26), y - s2 * 10, 12, { s: 18 + (k * 5) % 14, moss: 1 }); }
    creek.line = C;
  }
  // the line: from the start round the via points and back
  let start;
  if (R.from === 'mx') { const L = m.landmarks.find((l) => l.name === MX.name); if (!L) { out.missed.push(`${R.name}: no park`); return null; } start = [Math.floor((L.x + L.w) / TILE) + 2, Math.floor((L.y + L.h / 2) / TILE)]; }
  else start = R.start;
  // (a slow lumpy field over the open ground - a ride that wanders round the rough patches, not a ruler's line: value
  // noise on 20-tile cells, eased)
  const lump = (i) => {
    const tx = i % W, ty = (i / W) | 0, gx = Math.floor(tx / 20), gy = Math.floor(ty / 20), fx = tx / 20 - gx, fy = ty / 20 - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), h00 = hh(gx, gy, 997), h10 = hh(gx + 1, gy, 997), h01 = hh(gx, gy + 1, 997), h11 = hh(gx + 1, gy + 1, 997);
    return Math.round(R.lump * ((h00 * (1 - sx) + h10 * sx) * (1 - sy) + (h01 * (1 - sx) + h11 * sx) * sy));
  };
  const cost = (i) => {
    if (blocked.has(i)) return 0;
    const t = m.tiles[i], r = m.reserve[i];
    if (r & (1 | 2 | 8)) return 0;
    switch (t) {
      case T.GRASS: return (r & RES ? 18 : 10) + lump(i);
      case T.DIRT: return 8 + (r & RES ? 0 : lump(i));
      case T.SAND: return (r & RES ? 18 : 11) + lump(i);
      case T.WATER: case T.DEEP: return m.lake && m.lake[i] ? 0 : creek && creek.has(i) ? 60 : 400;
      case T.ROAD: return 60;
      case T.BRIDGE: return 30;
      case T.LOT: return 20;
    }
    return 0;
  };
  const way = [start, ...R.pts.map((q) => [q[0], q[1]]), start];
  let path = [];
  const marks = [];
  for (let j = 1; j < way.length; j++) {
    const a = way[j - 1], b = way[j], free = (x, y) => Math.abs(x - a[0]) + Math.abs(y - a[1]) <= 5 || Math.abs(x - b[0]) + Math.abs(y - b[1]) <= 5;
    const leg = routeTiles(m, a, b, cost, free, { slope: R.slope, pad: 60 });
    if (!leg) { out.missed.push(`${R.name}: leg ${j}`); continue; }
    path = path.length ? path.concat(leg.slice(1)) : leg;
    if (R.pts[j - 1] && R.pts[j - 1][2]) marks.push([R.pts[j - 1][2], path.length - 1]);
  }
  if (path.length < 20) { out.missed.push(R.name); return null; }
  // rounded (the router's 45-degree kinks into easy curves: every fifth step, Chaikin three times), every 16 px
  let L = path.filter((_, k) => k % 5 === 0 || k === path.length - 1).map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE]);
  for (let r = 0; r < 3; r++) { const q = [L[0]]; for (let k = 1; k < L.length; k++) { const [x0, y0] = L[k - 1], [x1, y1] = L[k]; q.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); } q.push(L[L.length - 1]); L = q; }
  const S = [];
  for (let k = 1; k < L.length; k++) { const [x0, y0] = L[k - 1], [x1, y1] = L[k], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 16)); for (let j = k === 1 ? 0 : 1; j <= n; j++) S.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n]); }
  // the line sways from side to side as it goes (R.wander tiles): pushed sideways by a slow field over the ground, so a
  // stretch ridden out and back sways the same way both times - only where the ground it sways onto is as open as the
  // line's (never into the water, onto the rocks or a road it kept off), eased in and out of there and at its ends
  if (R.wander) {
    const A = R.wander * TILE, C = 10, n = S.length, nrm = [], off = new Float32Array(n), ok = new Uint8Array(n), er = new Uint8Array(n), Wn = 8;
    const vn = (x, y, sd) => {
      const gx = Math.floor(x / C), gy = Math.floor(y / C), fx = x / C - gx, fy = y / C - gy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), h = (a, b) => hh(a, b, sd) * 2 - 1;
      return (h(gx, gy) * (1 - sx) + h(gx + 1, gy) * sx) * (1 - sy) + (h(gx, gy + 1) * (1 - sx) + h(gx + 1, gy + 1) * sx) * sy;
    };
    const ridable = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); if (!inF(tx, ty)) return false; const i = idx(tx, ty), t = m.tiles[i]; return (t === T.GRASS || t === T.DIRT || t === T.SAND) && !blocked.has(i) && !(m.reserve[i] & (1 | 2 | 8)) && !(creek && creek.has(i)); };
    for (let k = 0; k < n; k++) {
      const a = S[Math.max(0, k - 2)], b = S[Math.min(n - 1, k + 2)], h = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(h), ny = Math.cos(h);
      const tx = S[k][0] / TILE, ty = S[k][1] / TILE, d = A * (nx * vn(tx, ty, 981) + ny * vn(tx, ty, 983)), e = d + Math.sign(d) * R.hw, [x, y] = S[k];
      nrm.push([nx, ny]); off[k] = d;
      ok[k] = ridable(x + nx * d, y + ny * d) && ridable(x + nx * e, y + ny * e) && ridable(x + nx * d * 0.5, y + ny * d * 0.5) && ridable(x, y) ? 1 : 0;
    }
    for (let k = 0; k < n; k++) { let v = k >= 12 && k < n - 12 ? 1 : 0; for (let j = Math.max(0, k - Wn); j <= Math.min(n - 1, k + Wn) && v; j++) v = ok[j]; er[k] = v; }
    for (let k = 0; k < n; k++) { let t = 0, c = 0; for (let j = Math.max(0, k - Wn); j <= Math.min(n - 1, k + Wn); j++) { t += er[j]; c++; } const f = t / c; if (f > 0) S[k] = [S[k][0] + nrm[k][0] * off[k] * f, S[k][1] + nrm[k][1] * off[k] * f]; }
  }
  const N = S.length, head = (k) => { const a = S[Math.max(0, k - 2)], b = S[Math.min(N - 1, k + 2)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const turn = (k) => { let d = head(Math.min(N - 1, k + 3)) - head(Math.max(0, k - 3)); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  // the dirt under it (a ford where it splashes through the creek: bridge tiles, the water still under them), the
  // growth off it, its line for the bake
  let fords = 0, bridges = 0;
  const runs = []; let run = null;
  for (let k = 0; k < N; k++) {
    const [x, y] = S[k], tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), wet = inF(tx, ty) && wetT(m.tiles[idx(tx, ty)]);
    if (wet) { (run ||= []).push(k); continue; }
    if (run) { runs.push(run); run = null; }
    for (let yy = Math.floor((y - R.hw) / TILE); yy <= Math.floor((y + R.hw) / TILE); yy++) for (let xx = Math.floor((x - R.hw) / TILE); xx <= Math.floor((x + R.hw) / TILE); xx++) {
      if (!inF(xx, yy) || Math.hypot((xx + 0.5) * TILE - x, (yy + 0.5) * TILE - y) > R.hw) continue;
      const i = idx(xx, yy), t = m.tiles[i];
      if (t === T.GRASS || t === T.DIRT || t === T.SAND) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; m.reserve[i] &= ~128; }
    }
    clearVeg(x, y, R.hw + 18);
  }
  if (run) runs.push(run);
  runs.forEach((rk, n) => {
    const a0 = S[rk[0]], a1 = S[rk[rk.length - 1]], a = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2;
    for (const k of rk) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const tx = Math.floor(S[k][0] / TILE) + dx, ty = Math.floor(S[k][1] / TILE) + dy; if (inF(tx, ty) && wetT(m.tiles[idx(tx, ty)])) { m.tiles[idx(tx, ty)] = T.BRIDGE; m.reserve[idx(tx, ty)] |= RES; } }
    const L2 = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) + 40;
    // the first crossing of the creek bridged (a timber bridge over its ledge), the others splashed through
    if (R.creek && n === 0) { P('fbridge', mx, my, 0, { len: Math.round(L2 + 40), a: Math.round(a * 1000) / 1000 }); P('fallsmall', mx - Math.sin(a) * 70, my + Math.cos(a) * -70, 0, { w: 36, h: 22 }); bridges++; }
    else { for (const s2 of [-1, 1]) P('boulder', mx - Math.sin(a) * s2 * 44, my + Math.cos(a) * s2 * 44, 10, { s: 16, moss: 1 }); fords++; }
  });
  const pts = S.filter((_, k) => k % 2 === 0).map(([x, y]) => [Math.round(x), Math.round(y)]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  (m.tracks ||= []).push({ pts, hw: R.hw, bb: [Math.min(...xs) - 64, Math.min(...ys) - 64, Math.max(...xs) + 64, Math.max(...ys) + 64], ride: R.name });
  // its furniture: the berms round the tight corners (the enduro's), the numbered markers (the route's), a jump line
  // and a log ride and the root plate (the enduro's)
  let berms = 0, jumps = 0;
  const side = (k) => { const a = head(k); return [-Math.sin(a), Math.cos(a)]; };
  if (R.kind === 'enduro') for (let k = 6; k < N - 6; k += 2) {
    const t = turn(k);
    if (Math.abs(t) < 0.45) continue;
    const [nx, ny] = side(k), sd = t > 0 ? -1 : 1, [x, y] = S[k];
    P('berm', x + nx * sd * (R.hw + 12), y + ny * sd * (R.hw + 12), 0, { len: 40, a: Math.round(head(k) * 1000) / 1000, side: sd, h: 14 }); berms++;
  }
  // the longest straight: a jump line (three small tables) on the enduro; on the route, nothing (it's a ride, not a park)
  let bestRun = null;
  for (let k = 10; k < N - 10;) { if (Math.abs(turn(k)) > 0.12) { k++; continue; } let n = 0; while (k + n < N - 10 && Math.abs(turn(k + n)) <= 0.12) n++; if (!bestRun || n > bestRun.n) bestRun = { k, n }; k += n + 1; }
  if (R.kind === 'enduro' && bestRun && bestRun.n >= 30) {
    for (let j = 0; j < 3; j++) {
      const k = bestRun.k + 6 + j * 8, [x, y] = S[k], a = Math.round(head(k) / (Math.PI / 8)) * (Math.PI / 8);
      const J = { x: Math.round(x), y: Math.round(y), a: Math.round(a * 1000) / 1000, len: 6 * TILE, w: R.hw * 2 + 8, h: 16, ramp: 3 * TILE, kind: 'table', name: R.name };
      (m.jumps ||= []).push(J); P('tabletop', x, y, 0, { len: J.len, w: J.w, h: J.h, ramp: J.ramp, a: J.a }); jumps++;
    }
  }
  if (R.kind === 'enduro' && bestRun) {
    // a log ride: a fallen trunk along the line's edge after the jumps; the root plate at the sharpest corner
    const k = Math.min(N - 8, bestRun.k + Math.max(30, bestRun.n - 8)), [x, y] = S[k], [nx, ny] = side(k);
    P('rwlog', x + nx * (R.hw + 10), y + ny * (R.hw + 10), 0, { len: 240, flip: false });
    let sharp = 0, sk = 10; for (let k2 = 10; k2 < N - 10; k2++) if (Math.abs(turn(k2)) > sharp) { sharp = Math.abs(turn(k2)); sk = k2; }
    const [rx, ry] = S[sk], [rnx, rny] = side(sk), sd = turn(sk) > 0 ? 1 : -1;
    P('rootplate', rx + rnx * sd * (R.hw + 40), ry + rny * sd * (R.hw + 40), 16);
  }
  const marker = (n, k) => { const [nx, ny] = side(k), [x, y] = S[Math.min(N - 1, k)]; P('textsign', x + nx * (R.hw + 26), y + ny * (R.hw + 26), 0, { text: String(n), bg: '#6a3a1e', fg: [250, 230, 190], z: 26, sx: 2 }); };
  // the markers: the numbered turns, by the samples nearest each marked path point
  const nearestS = (tx, ty) => { let bk = 0, bd = 1e18; for (let k = 0; k < N; k++) { const d = (S[k][0] - (tx + 0.5) * TILE) ** 2 + (S[k][1] - (ty + 0.5) * TILE) ** 2; if (d < bd) { bd = d; bk = k; } } return bk; };
  for (const [n, pk] of marks) marker(n, nearestS(path[pk][0], path[pk][1]));
  // the start: the trailhead (the enduro's car park, its board and sign, the riders' trucks, bikes left there); the
  // route's sign at the park's gate
  const [x0, y0] = S[0], [n0x, n0y] = side(0);
  if (R.kind === 'enduro') {
    for (let ty = Math.floor(y0 / TILE) - 3; ty <= Math.floor(y0 / TILE) + 3; ty++) for (let tx = Math.floor(x0 / TILE) - 6; tx <= Math.floor(x0 / TILE) + 6; tx++) { if (!inF(tx, ty)) continue; const i = idx(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { m.tiles[i] = T.LOT; m.reserve[i] |= RES; } }
    clearVeg(x0, y0, 7 * TILE);
    // the drive in from the road (west of it, the nearest road tile along the row): a dirt band to the lot
    let rx = Math.floor(x0 / TILE) - 7; while (rx > Math.floor(x0 / TILE) - 40 && inF(rx, Math.floor(y0 / TILE)) && m.tiles[idx(rx, Math.floor(y0 / TILE))] !== T.ROAD) rx--;
    if (inF(rx, Math.floor(y0 / TILE)) && m.tiles[idx(rx, Math.floor(y0 / TILE))] === T.ROAD) {
      for (let tx = rx + 1; tx <= Math.floor(x0 / TILE) - 6; tx++) for (let dy = -1; dy <= 1; dy++) { const ty = Math.floor(y0 / TILE) + dy; if (!inF(tx, ty)) continue; const i = idx(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
      (m.tracks ||= []).push({ pts: [[Math.round((rx + 1) * TILE), Math.round(y0)], [Math.round(x0 - 6 * TILE), Math.round(y0)]], hw: 44, bb: [(rx + 1) * TILE - 60, y0 - 60, x0 - 6 * TILE + 60, y0 + 60] });
      for (let tx = rx; tx <= Math.floor(x0 / TILE); tx += 3) clearVeg((tx + 0.5) * TILE, y0, 70);
    }
    for (let k = 0; k < 3; k++) (m.parking ||= []).push({ x: Math.round(x0 - 4.5 * TILE + k * 3 * TILE), y: Math.round(y0 - 1.6 * TILE), a: Math.PI / 2, model: ['pickup', 'van', 'pickup'][k], ride: 1 });
    for (let k = 0; k < 3; k++) (m.parking ||= []).push({ x: Math.round(x0 + 2 * TILE + k * 46), y: Math.round(y0 + 1.8 * TILE), a: -Math.PI / 2, model: 'dirtbike', ride: 1 });
    P('mapboard', x0 + 5.5 * TILE, y0 - 2.6 * TILE, 10);
    P('textsign', x0 - 5.6 * TILE, y0 + 2.8 * TILE, 0, { text: 'HIGHLAND ENDURO', bg: '#3a5a2a', fg: [250, 236, 190], z: 34 });
    P('fingerpost', x0 + 6 * TILE, y0 + 2 * TILE, 4); P('trashcan', x0 - 6.4 * TILE, y0 - 2 * TILE, 6);
  } else P('textsign', x0 + n0x * (R.hw + 30), y0 + n0y * (R.hw + 30), 0, { text: 'RED ROCK TRAIL', bg: '#a8341e', fg: [250, 236, 200], z: 32 });
  // the route's rest stop at its marked point (the ramada, the table, the tank, a fence), and its wash
  if (R.rest) {
    const mk = marks.find((q) => q[0] === R.rest);
    if (mk) {
      const k = nearestS(path[mk[1]][0], path[mk[1]][1]), [nx, ny] = side(k), cx = S[k][0] + nx * (R.hw + 90), cy = S[k][1] + ny * (R.hw + 90);
      for (let ty = Math.floor(cy / TILE) - 4; ty <= Math.floor(cy / TILE) + 4; ty++) for (let tx = Math.floor(cx / TILE) - 5; tx <= Math.floor(cx / TILE) + 5; tx++) { if (!inF(tx, ty)) continue; const i = idx(tx, ty); if (m.tiles[i] === T.SAND || m.tiles[i] === T.GRASS) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; } }
      clearVeg(cx, cy, 6 * TILE);
      P('pergola', cx, cy, 0, { w: 160, d: 120, h: 56 }); P('picnic', cx, cy + 10, 8);
      P('otank', cx + 130, cy - 20, 30, { r: 28, h: 52, c: '#9a9ea2' }); P('trough', cx + 130, cy + 30, 6);
      P('fenceline', cx - 140, cy + 100, 0, { kind: 'wood', tx: 280, ty: 0 });
      P('textsign', cx - 120, cy - 70, 0, { text: 'REST STOP', bg: '#6a3a1e', fg: [250, 230, 190], z: 28 });
    }
  }
  // the riders' camp at its marked point (R.camp; shared/world3-camps.js): off the track on open ground, its fire,
  // tents, chairs and coolers, the riders' dirt bikes parked by it (to take) and their pickup
  if (R.camp) {
    const mk = marks.find((q) => q[0] === R.camp);
    const k = mk ? nearestS(path[mk[1]][0], path[mk[1]][1]) : -1;
    let at = null;
    if (k >= 0) for (const off of [170, 200, 230, 260, 300]) { for (const sd of [1, -1]) { const [nx, ny] = side(k), tx = Math.floor((S[k][0] + nx * sd * (R.hw + off)) / TILE), ty = Math.floor((S[k][1] + ny * sd * (R.hw + off)) / TILE); if (campFits(m, tx, ty)) { at = { tx, ty, sd, nx, ny }; break; } } if (at) break; }
    if (at) {
      const campClear = new Set(), water = Math.atan2(-at.ny * at.sd, -at.nx * at.sd);   // (facing the track, the way they came)
      const spot = camp3(m, at.tx, at.ty, 'riders', water, P, campClear);
      if (H3.removeProps) H3.removeProps(m, (x, y) => campClear.has(Math.floor(y / TILE) * W + Math.floor(x / TILE)));
      const X = spot.x, Y = spot.y, ux = Math.cos(water), uy = Math.sin(water), vx = -uy, vy = ux;
      for (let j = 0; j < 2; j++) (m.parking ||= []).push({ x: Math.round(X + vx * (3.4 + j * 1.4) * TILE + ux * 0.6 * TILE), y: Math.round(Y + vy * (3.4 + j * 1.4) * TILE + uy * 0.6 * TILE), a: Math.round(water * 1000) / 1000, model: 'dirtbike', ride: 1 });
      (m.parking ||= []).push({ x: Math.round(X - vx * 4.2 * TILE), y: Math.round(Y - vy * 4.2 * TILE), a: Math.round((water + Math.PI / 2) * 1000) / 1000, model: 'pickup', ride: 1 });
      out.camp = { x: X, y: Y, marker: R.camp };
    }
  }
  if (R.wash) {
    let C = R.wash.pts.map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE]);
    for (let r = 0; r < 2; r++) { const q = [C[0]]; for (let k = 1; k < C.length; k++) { const [x0, y0] = C[k - 1], [x1, y1] = C[k]; q.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); } q.push(C[C.length - 1]); C = q; }
    let n = 0;
    for (let k = 1; k < C.length; k++) {
      const [ax, ay] = C[k - 1], [bx, by] = C[k], nn = Math.ceil(Math.hypot(bx - ax, by - ay) / 12);
      for (let j = 0; j <= nn; j++) {
        const x = ax + (bx - ax) * j / nn, y = ay + (by - ay) * j / nn, w = R.wash.hw * TILE * (0.7 + 0.6 * hh(Math.floor(x / 96), Math.floor(y / 96), 993));
        for (let ty = Math.floor((y - w) / TILE); ty <= Math.floor((y + w) / TILE); ty++) for (let tx = Math.floor((x - w) / TILE); tx <= Math.floor((x + w) / TILE); tx++) {
          if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > w) continue;
          const i = idx(tx, ty), t = m.tiles[i];
          if ((t === T.SAND || t === T.DIRT || t === T.GRASS) && !(m.reserve[i] & (1 | 2 | 8 | 128))) { m.tiles[i] = T.SAND; m.reserve[i] |= 128 | RES; n++; }
        }
      }
      if (k % 2 === 0) for (const s2 of [-1, 1]) P('boulder', ax + s2 * R.wash.hw * TILE * 0.5, ay + (s2 * 13) % 17, 14, { s: 20 + (k * 7) % 18 });
    }
    out.washTiles = n;
  }
  if (drop.size && H3.removeProps) H3.removeProps(m, (x, y) => drop.has(x + ',' + y));
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  let len = 0; for (let k = 1; k < path.length; k++) len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
  m.natureSites.push({ kind: R.kind === 'enduro' ? 'enduro' : 'route', name: R.name, x: Math.round(x0), y: Math.round(y0), len: Math.round(len), line: pts.filter((_, k) => k % 4 === 0) });
  if (R.kind === 'enduro') (m.landmarks ||= []).push({ name: R.name, type: 'trail', x: Math.round(x0 - 7 * TILE), y: Math.round(y0 - 4 * TILE), w: 14 * TILE, h: 8 * TILE });
  return { name: R.name, len: Math.round(len), markers: marks.length, berms, jumps, fords, bridges };
}
