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
// For the whole-world build only (shared/world3-world.js calls buildDirt3 from its done hook). Deterministic: authored
// shapes and integer hashes; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';

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

export function buildDirt3(m, H3) {
  const out = { mx: null, missed: [] };
  if (!H3 || !H3.addProp) return out;
  out.mx = mxPark(m, H3, out);
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
  for (let k = 0; k < N; k += 3) {
    const t = turn(k), a = head(k), nx = -Math.sin(a), ny = Math.cos(a);   // (n: to the right of the way round)
    if (Math.abs(t) > 0.5) {
      const side = t > 0 ? -1 : 1;   // (turning right: the outside is on the left)
      const [x, y] = S[k], bx = x + nx * side * (MX.hw + 14), by = y + ny * side * (MX.hw + 14);
      P('berm', bx, by, 0, { len: 64, a: Math.round(a * 1000) / 1000, side, h: Math.round(10 + Math.min(1, Math.abs(t) / 1.2) * 12) }); berms++;
      if (k % 6 === 0) P('tires', x + nx * side * (MX.hw + 56), y + ny * side * (MX.hw + 56), 10);
    } else if (Math.abs(t) < 0.12 && k % 9 === 0) {
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
  P('timingtower', g0[0] + gnx * -(MX.hw + 120), g0[1] + gny * -(MX.hw + 120), 30);
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
