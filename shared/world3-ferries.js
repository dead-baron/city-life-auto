// World v3's ferries (docs/WORLD-V3.md 1.7 and 8.17; shared/world3-skeleton.js FERRIES): the piers and terminals the
// world build lays where each route calls, and the ways between them planned per route corridor for the server's boats
// (server/systems/ferries.js runs them on their timetable). The world build calls buildFerries3 once, at its end
// (shared/world3-world.js `done`); the server calls planFerries3 when its map has them. The page never imports this.
//
// Where a route calls: the skeleton's points (FERRY3 below: which of a route's points is a stop, and what is built
// there). At each, the shore of the place nearest the point (its districts' land, not a bridge's deck or a wall) where a
// pier can run straight out (north, south, east or west) onto open water with room for the boat to lie at its end:
// - a walk-on terminal (the Bay Ferry's five, FE1): a paved forecourt at the water's edge, a waiting room on it, a
//   gangway out to the pier head where the boat lies stern-in, bollards along it, benches and a lamp;
// - a car ferry's ramp (Port Westport, Gull Harbor; FE2): a marshalling lot by a street, a ticket booth, a wide slip
//   down to the boat's stern;
// - a water bus stop (the river, the cays, the lighthouse, the prison): a small pontoon at the end of a short gangway.
// Each stop is listed in m.world3.ferries with its pier's end (where the boat's stern lies) and the way out.
import { TILE, T } from './constants.js';
import { FERRIES } from './world3-skeleton.js';
import { DISTRICTS } from './mapcore.js';

const named = (...names) => names.map((n) => DISTRICTS.findIndex((d) => d && d.name === n)).filter((d) => d >= 0);
const MAINLAND = 'mainland';   // (any of the mainland's districts: 47 and up)
const ANY = 'any';             // (any land: World v3b's city islands and shores are meadow until the city generator paints them)

// The routes as built (World v3b, FERRIES3): `pt` the skeleton point of the route (FERRIES[k].pts) it calls at, `ids`
// whose land the pier stands on, `kind` what is built. A loop runs round its stops; the others run out and back.
export const FERRY3 = [
  { name: 'Gull Harbor Car Ferry', model: 'ferry', car: true, stops: [
    { pt: 0, name: 'Westport Ferry Terminal', kind: 'ramp', ids: ANY },
    { pt: 3, name: 'Gull Harbor', kind: 'ramp', ids: ANY },
  ] },
  // custody only (the owner's list, 1.7): no arrests system takes prisoners to the island yet - built and listed
  { name: 'Prison Boat', model: 'waterbus', custody: true, stops: [
    { pt: 0, name: 'Sandpiper Bay Police Dock', kind: 'pontoon', ids: ANY },
    { pt: 2, name: 'Prison Island', kind: 'pontoon', ids: named('Prison Island') },
  ] },
  { name: 'Gulf Water Bus', model: 'waterbus', loop: true, stops: [
    { pt: 0, name: 'Harbor', kind: 'terminal', ids: ANY },
    { pt: 2, name: 'Arts District', kind: 'terminal', ids: ANY },
    { pt: 3, name: 'Port Westport', kind: 'terminal', ids: ANY },
    { pt: 5, name: 'Sunset Beach', kind: 'terminal', ids: ANY },
    { pt: 7, name: 'Lake District', kind: 'terminal', ids: ANY },
  ] },
  { name: 'Key Water Bus', model: 'waterbus', stops: [
    // (on Pelican Key's own beach, the island's south shore facing the key, round the route's middle point: from any land
    // round its first point - inland - the nearest shore is the channel on the island's north side, which the boat can't
    // leave within its corridor: no way to plan)
    { pt: 1, name: 'Pelican Key', kind: 'pontoon', ids: named('Pelican Key') },
    { pt: 2, name: 'Coral Cay', kind: 'pontoon', ids: ANY },
  ] },
];

// what each kind of stop takes (tiles), out from the shore tile along the way out (k) and across it (j): the rows of
// the pier (`rows`: the half-width of each row out, 1 to `out`), the ground behind it ashore (`back`: across, deep;
// what it's paved with), the building and where (`bld`: across from the pier's line j0..j1, out k0..k1 - out over the
// water on the terminal's deck, back on the ramp's lot), and the water the boat lies on beyond the pier's end (`berth`:
// out, half across - the longest boat that calls: the car ferry 470 x 150 px, a water bus 240 x 76). A kind's second
// spec is tried where the first finds no shore: a smaller lot, no street needed.
// - the terminal (FE1): a deck out over the water 15 tiles across and 6 out, the waiting room on it (7 x 4), then the
//   gangway (3 across, 4 out) to the pier head (7 across); the street or the promenade behind it as it is
// - the ramp (FE2): the slip 7 across, 3 out, down from the marshalling lot; the ticket booth on the lot
// - the pontoon: a gangway 3 across, 3 out, and the pontoon 5 across, 2 out; a patch of boards ashore
const rowsOf = (spans) => (k) => { for (const [k1, half] of spans) if (k <= k1) return half; return -1; };
const KIND = {
  terminal: [{ out: 12, rows: rowsOf([[6, 7], [10, 1], [12, 3]]), back: [3, 1], pave: T.PLAZA, bld: [1, 7, 2, 5], berth: [10, 6] }],
  ramp: [
    { out: 3, rows: rowsOf([[3, 3]]), back: [12, 10], pave: T.LOT, road: 14, bld: [4, 6, -9, -7], berth: [18, 9] },
    { out: 3, rows: rowsOf([[3, 3]]), back: [8, 5], pave: T.LOT, bld: [3, 4, -4, -3], berth: [18, 9] },
  ],
  pontoon: [
    { out: 5, rows: rowsOf([[3, 1], [5, 2]]), back: [4, 2], pave: T.DOCK, berth: [10, 6] },
    { out: 5, rows: rowsOf([[3, 1], [5, 2]]), back: [2, 1], pave: T.DOCK, berth: [10, 6] },
  ],
};
const SEARCH = 240;   // tiles round the skeleton's point
const isW = (t) => t === T.WATER || t === T.DEEP;
const FREE = new Set([T.GRASS, T.SAND, T.DIRT, T.PLAZA, T.SIDEWALK, T.LOT, T.DOCK]);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// the stop's place: the pier's shore tile (sx, sy), the way out (dx, dy) - or null
function findShore(m, st, tx0, ty0, K) {
  const W = m.w, H = m.h;
  const ok = st.ids === ANY ? () => true : st.ids === MAINLAND ? (d) => d >= 47 : ((s) => (d) => s.has(d))(new Set(st.ids));
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1);
  const tile = (x, y) => { const i = at(x, y); return i < 0 ? -1 : m.tiles[i]; };
  // (not on the container port's quay - its cranes' apron - nor where its ship lies alongside: m.port)
  const avoid = [];
  if (m.port && m.port.apron) avoid.push([m.port.apron.x - 8, m.port.apron.y0 - 3, m.port.apron.x + m.port.apron.w + 8, m.port.apron.y1 + 3]);   // (the quay's edge, the cranes' rails and the apron)
  if (m.port && m.port.ship) { const sh = m.port.ship; avoid.push([Math.floor(sh.x / TILE) - 3, Math.floor(sh.y / TILE) - 3, Math.ceil((sh.x + sh.w) / TILE) + 3, Math.ceil((sh.y + sh.h) / TILE) + 3]); }
  const clash = (x, y) => avoid.some((r) => x >= r[0] && y >= r[1] && x < r[2] && y < r[3]);
  let best = null;
  for (let y = Math.max(1, ty0 - SEARCH); y < Math.min(H - 1, ty0 + SEARCH); y++) for (let x = Math.max(1, tx0 - SEARCH); x < Math.min(W - 1, tx0 + SEARCH); x++) {
    const i = y * W + x, t = m.tiles[i];
    if (isW(t) || t === T.BRIDGE || t === T.WALL || t === T.BUILDING || !m.land[i] || !ok(m.dist[i])) continue;
    const dd = (x - tx0) * (x - tx0) + (y - ty0) * (y - ty0);
    if (best && dd >= best.score * best.score) continue;
    for (const [dx, dy] of DIRS) {
      if (!isW(tile(x + dx, y + dy))) continue;
      const px = -dy, py = dx;
      // the pier out over the water (its first two rows may cover open shore), then the berth: open water, no bridge
      let wet = true;
      for (let k = 1; k <= K.out + K.berth[0] && wet; k++) {
        const half = k > K.out ? K.berth[1] : K.rows(k);
        for (let j = -half; j <= half; j++) {
          const q = at(x + dx * k + px * j, y + dy * k + py * j), tq = q < 0 ? -1 : m.tiles[q];
          if (avoid.length && clash(x + dx * k + px * j, y + dy * k + py * j)) { wet = false; break; }
          if (isW(tq) || (k <= 2 && FREE.has(tq) && m.land[q] && ok(m.dist[q]))) continue;
          wet = false; break;
        }
      }
      if (!wet || (avoid.length && clash(x, y))) continue;
      if (st.river && !m.river[at(x + dx * (K.out + 4), y + dy * (K.out + 4))]) continue;   // (on the river or the lake)
      // the ground behind it: the place's land, open (no street, building or wall), and the way on ashore
      let room = !isW(tile(x - dx * K.back[1], y - dy * K.back[1]));
      for (let k = 0; k < K.back[1] && room; k++) for (let j = -(K.back[0] >> 1); j <= K.back[0] >> 1; j++) {
        const q = at(x - dx * k + px * j, y - dy * k + py * j);
        if (q < 0 || !m.land[q] || !FREE.has(m.tiles[q]) || !ok(m.dist[q])) { room = false; break; }
      }
      if (!room) continue;
      // a street near behind it (the ramp's lot must have one; anything is better with one)
      let road = 99;
      for (let k = K.back[1]; k < K.back[1] + 20 && road === 99; k++) for (let j = -(K.back[0] >> 1) - 2; j <= (K.back[0] >> 1) + 2; j++) { const tl = tile(x - dx * k + px * j, y - dy * k + py * j); if (tl === T.ROAD || tl === T.SIDEWALK) { road = k - K.back[1]; break; } }
      if (K.road && road > K.road) continue;
      const score = Math.sqrt(dd) + (road === 99 ? 60 : road);
      if (!best || score < best.score) best = { sx: x, sy: y, dx, dy, score, road: road < 99 };
    }
  }
  return best;
}

// lay one stop: the ground behind, the pier, its building, the dressing -> the stop as listed
function layStop(m, st, R, sh, K, H3) {
  const W = m.w, { sx, sy, dx, dy } = sh, px = -dy, py = dx;
  const at = (x, y) => y * W + x, touched = [];
  const put = (x, y, t) => { const i = at(x, y); m.tiles[i] = t; if (m.reserve) m.reserve[i] |= 16; touched.push([x, y]); if (t === T.DOCK && !m.land[i]) m.river[i] = 0; };
  for (let k = 0; k < K.back[1]; k++) for (let j = -(K.back[0] >> 1); j <= K.back[0] >> 1; j++) put(sx - dx * k + px * j, sy - dy * k + py * j, K.pave);
  for (let k = 1; k <= K.out; k++) { const half = K.rows(k); for (let j = -half; j <= half; j++) put(sx + dx * k + px * j, sy + dy * k + py * j, T.DOCK); }
  // the way ashore: boards (3 across) back over the beach or the grass to the street, the promenade or a path, when one
  // is within 30 tiles straight behind (Northshore Pier stands on the beach)
  if (st.kind !== 'ramp') {
    const soft = (t) => t === T.SAND || t === T.GRASS || t === T.DIRT, path = [];
    let k = K.back[1], reached = false;
    for (; k < K.back[1] + 30; k++) {
      const t = m.tiles[at(sx - dx * k, sy - dy * k)];
      if (t === T.ROAD || t === T.SIDEWALK || t === T.PLAZA || t === T.LOT) { reached = true; break; }
      if (!soft(t)) break;
      path.push(k);
    }
    if (reached) for (const kk of path) for (let j = -1; j <= 1; j++) { const x = sx - dx * kk + px * j, y = sy - dy * kk + py * j; if (soft(m.tiles[at(x, y)])) put(x, y, T.DOCK); }
  }
  let bld = null;
  if (K.bld) {
    const [j0, j1, k0, k1] = K.bld, xs = [sx + dx * k0 + px * j0, sx + dx * k1 + px * j1], ys = [sy + dy * k0 + py * j0, sy + dy * k1 + py * j1];
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.abs(xs[1] - xs[0]) + 1, h = Math.abs(ys[1] - ys[0]) + 1;
    const bid = m.buildings.length, d = m.dist[at(sx, sy)], booth = st.kind === 'ramp';
    m.roofs.push({ tx: x0, ty: y0, tw: w, th: h, kind: booth ? 'tar' : 'metal', seed: (x0 * 7919 + y0 * 104729) | 0, d, b: bid });
    bld = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x0, ty: y0, tw: w, th: h, kind: booth ? 'booth' : 'terminal', name: `${R.name} - ${st.name}`, business: null, signs: [{ x: Math.round((sx + 0.5 + dx * (k0 - 0.6)) * TILE), y: Math.round((sy + 0.5 + dy * (k0 - 0.6)) * TILE), text: R.name }] };
    m.buildings.push(bld);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { m.tiles[at(x, y)] = T.BUILDING; m.bld[at(x, y)] = bid; touched.push([x, y]); }
  }
  // clear what stood there, then the dressing: bollards along the pier, mooring posts at its head, benches and a lamp
  const minX = Math.min(...touched.map((p) => p[0])), maxX = Math.max(...touched.map((p) => p[0])), minY = Math.min(...touched.map((p) => p[1])), maxY = Math.max(...touched.map((p) => p[1]));
  if (H3 && H3.removeProps) H3.removeProps(m, (x, y) => x >= minX * TILE - 8 && x < (maxX + 1) * TILE + 8 && y >= minY * TILE - 8 && y < (maxY + 1) * TILE + 8);
  const prop = (t, tx, ty, extra) => { const p = { t, x: Math.round(tx * TILE), y: Math.round(ty * TILE), ...extra }; m.props.push(p); if (t === 'lamp') m.lamps.push(p); return p; };
  const cx = sx + 0.5, cy = sy + 0.5, P = (k, j) => [cx + dx * k + px * j, cy + dy * k + py * j], headK = K.out - 0.5, headH = K.rows(K.out);
  for (const j of [-headH - 0.2, headH + 0.2]) prop('mooring', ...P(headK, j), { lift: 4 });
  if (st.kind === 'terminal') {
    for (let k = 7.5; k < 11; k += 1.5) for (const j of [-1.4, 1.4]) prop('bollard', ...P(k, j));
    for (const j of [-6, -4, -2]) prop('bench_m', ...P(3, j));
    prop('lamp', ...P(1, -6.5)); prop('lamp', ...P(6, -1.6)); prop('trashcan', ...P(5, -6.5));
  } else if (st.kind === 'ramp') {
    for (const j of [-4.4, 4.4]) for (const k of [1, 3]) prop('bollard', ...P(k, j));
    prop('lamp', ...P(-2, -(K.back[0] >> 1) + 0.5));
  } else { prop('bollard', ...P(2, -1.4)); prop('lamp', ...P(4.5, 2.4)); }
  // the stop as listed: the pier's end (the boat's stern lies there), the way out, the landing behind it for the cars
  const end = { x: Math.round((cx + dx * (K.out + 0.5)) * TILE), y: Math.round((cy + dy * (K.out + 0.5)) * TILE) };
  const land = st.kind === 'ramp' ? { x: Math.round((cx - dx * (K.back[1] >> 1)) * TILE), y: Math.round((cy - dy * (K.back[1] >> 1)) * TILE) } : null;
  return { name: st.name, kind: st.kind, x: end.x, y: end.y, ox: dx, oy: dy, shore: [sx, sy], land, building: bld ? bld.id : -1, pt: st.pt };
}

// The world build's call (shared/world3-world.js `done`): every route's stops laid -> m.world3.ferries
// [{ name, model, car, loop, custody, stops: [{ name, kind, x, y, ox, oy, shore, land, building, pt }], hint }]
// (a stop that found no shore is left out and named in `missing`)
export function buildFerries3(m, H3) {
  const out = [], missing = [];
  for (const R of FERRY3) {
    const S = FERRIES.find((f) => f.name === R.name);
    if (!S) continue;
    const stops = [];
    for (const st of R.stops) {
      const [tx, ty] = S.pts[st.pt];
      let sh = null, K = null;
      for (const k of KIND[st.kind]) { sh = findShore(m, st, tx, ty, k); if (sh) { K = k; break; } }
      if (!sh) { missing.push(`${R.name}: ${st.name}`); continue; }
      stops.push(layStop(m, st, R, sh, K, H3));
    }
    out.push({ name: R.name, model: R.model, car: !!R.car, loop: !!R.loop, custody: !!R.custody, stops, hint: S.pts });
  }
  out.missing = missing;
  return out;
}

// ---- the ways between the stops (the server's planner) ---------------------------------------------------------------
// A route's legs are planned one at a time inside the box round the skeleton's points between the two stops (their
// corridor), not over the whole map: the water there (a bridge's deck is over water: the boats pass under), how far
// each water tile is from land (to 16), A* over cells of 2 x 2 tiles at least `clear` tiles from land, then
// straightened. A leg that finds no way in its corridor tries once more in a box three times as wide.
// (the boats' water: open water, and whatever stands over it on a deck - a bridge, its sidewalks and parapets: the boats
// pass under; not a pier, a quay or a building on one)
const passW = (t) => t === T.WATER || t === T.DEEP || t === T.BRIDGE;
export const boatWater = (m, i) => { const t = m.tiles[i]; return passW(t) || (!m.land[i] && t !== T.DOCK && t !== T.BUILDING); };
export function corridorWay(m, a, b, hint, clear, pad = 60) {
  const W = m.w, H = m.h;
  let x0 = Math.min(a.x, b.x) / TILE, y0 = Math.min(a.y, b.y) / TILE, x1 = Math.max(a.x, b.x) / TILE, y1 = Math.max(a.y, b.y) / TILE;
  for (const [x, y] of hint) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bx = Math.max(0, Math.floor(x0) - pad), by = Math.max(0, Math.floor(y0) - pad), bw = Math.min(W, Math.ceil(x1) + pad) - bx, bh = Math.min(H, Math.ceil(y1) + pad) - by;
  const N = bw * bh, dist = new Uint8Array(N), q = new Int32Array(N);
  let qh = 0, qt = 0;
  // (a ship moored at a quay is in the way as much as the quay: m.portShips, px rects - the Harbor's, shared/world3-harbor.js)
  const ships = (m.portShips || []).map((r) => [Math.floor(r.x / TILE), Math.floor(r.y / TILE), Math.ceil((r.x + r.w) / TILE), Math.ceil((r.y + r.h) / TILE)]);
  const moored = (x, y) => ships.some((r) => x >= r[0] && y >= r[1] && x < r[2] && y < r[3]);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x; if (!boatWater(m, (by + y) * W + bx + x) || (ships.length && moored(bx + x, by + y))) { dist[i] = 0; q[qt++] = i; } else dist[i] = 255; }
  while (qh < qt) {
    const j = q[qh++], d = dist[j];
    if (d >= 16) continue;
    const x = j % bw, y = (j / bw) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const k = ny * bw + nx;
      if (dist[k] > d + 1) { dist[k] = d + 1; q[qt++] = k; }
    }
  }
  const dAt = (px, py) => { const x = Math.floor(px / TILE) - bx, y = Math.floor(py / TILE) - by; return x < 0 || y < 0 || x >= bw || y >= bh ? 0 : dist[y * bw + x]; };
  const CW = Math.ceil(bw / 2), CH = Math.ceil(bh / 2), NC = CW * CH, open = new Uint8Array(NC);
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    let ok = 1;
    for (let k = 0; k < 4 && ok; k++) { const x = cx * 2 + (k & 1), y = cy * 2 + (k >> 1); if (x >= bw || y >= bh || dist[y * bw + x] < clear) ok = 0; }
    open[cy * CW + cx] = ok;
  }
  const cellOf = (p) => { const x = Math.floor((p.x / TILE - bx) / 2), y = Math.floor((p.y / TILE - by) / 2); return x < 0 || y < 0 || x >= CW || y >= CH ? -1 : y * CW + x; };
  const s = cellOf(a), g = cellOf(b);
  if (s < 0 || g < 0) return null;
  const cost = new Float64Array(NC).fill(Infinity), from = new Int32Array(NC).fill(-1), hf = [], hi = [];
  const gx = g % CW, gy = (g / CW) | 0;
  const h = (c) => { const dx = Math.abs(c % CW - gx), dy = Math.abs(((c / CW) | 0) - gy); return (dx + dy - 0.586 * (dx < dy ? dx : dy)) * 1.4; };
  const push = (f, c) => { let k = hf.length; hf.push(f); hi.push(c); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hi[k] = hi[p]; k = p; } hf[k] = f; hi[k] = c; };
  const pop = () => { const top = hi[0], lf = hf.pop(), li = hi.pop(), n = hf.length; if (n) { let k = 0; for (;;) { const l = 2 * k + 1; if (l >= n) break; const r = l + 1, mm = r < n && hf[r] < hf[l] ? r : l; if (hf[mm] >= lf) break; hf[k] = hf[mm]; hi[k] = hi[mm]; k = mm; } hf[k] = lf; hi[k] = li; } return top; };
  cost[s] = 0; push(h(s), s);
  let found = false;
  while (hf.length) {
    const c = pop();
    if (c === g) { found = true; break; }
    const x = c % CW, y = (c / CW) | 0, c0 = cost[c];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
      const j = ny * CW + nx, cj = c0 + (dx && dy ? 1.414 : 1);
      if (cj >= cost[j] || (j !== g && !open[j])) continue;
      cost[j] = cj; from[j] = c; push(cj + h(j), j);
    }
  }
  if (!found) return pad < 180 ? corridorWay(m, a, b, hint, clear, pad * 3) : null;
  const cells = [];
  for (let c = g; c >= 0; c = from[c]) { cells.push(c); if (c === s) break; }
  cells.reverse();
  const pts = cells.map((c) => ({ x: (bx + (c % CW) * 2 + 1) * TILE, y: (by + ((c / CW) | 0) * 2 + 1) * TILE }));
  pts[0] = { x: a.x, y: a.y }; pts[pts.length - 1] = { x: b.x, y: b.y };
  const clearLine = (p, r) => { const L = Math.hypot(r.x - p.x, r.y - p.y), n = Math.ceil(L / 24); for (let k = 1; k < n; k++) if (dAt(p.x + (r.x - p.x) * k / n, p.y + (r.y - p.y) * k / n) < clear) return false; return true; };
  const way = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let next = i + 1;
    for (let k = pts.length - 1; k > i + 1; k--) if (clearLine(pts[i], pts[k])) { next = k; break; }
    way.push(pts[next]); i = next;
  }
  let sum = 0;
  way.forEach((p, k) => { if (k) sum += Math.hypot(p.x - way[k - 1].x, p.y - way[k - 1].y); p.s = sum; });
  way.box = [bx, by, bw, bh];
  return way;
}

// A boat of `dims` ({ L, W, clear, turn }: server/systems/ferries.js DIMS) at a listed stop: lying stern-in at the pier's
// end, bow out; where it turns round (the first place out with water `turn` tiles all round it) - the berth as the
// runner wants it ({ x, y, a, ox, oy, sx, sy, turn, land })
export function berth3(m, st, dims) {
  const ox = st.ox, oy = st.oy, sx = st.x, sy = st.y;
  const bx = sx + ox * (dims.L / 2 + 4), by = sy + oy * (dims.L / 2 + 4);
  const wetAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && boatWater(m, ty * m.w + tx); };
  const roomy = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && !wetAt(x + dx * TILE, y + dy * TILE)) return false; return true; };
  let turn = null;
  for (let f = dims.L / 2 + 64; f <= dims.L + 1400; f += 22) {
    const x = bx + ox * f, y = by + oy * f;
    if (!wetAt(x, y)) break;
    if (roomy(x, y, dims.turn + 1)) { turn = { x, y }; break; }
  }
  turn ||= { x: bx + ox * (dims.L / 2 + 64), y: by + oy * (dims.L / 2 + 64) };
  return { x: bx, y: by, a: Math.atan2(oy, ox), ox, oy, sx, sy, turn, land: st.land, name: st.name, kind: st.kind };
}

// the skeleton's points between two stops of a route (its corridor's hint): from stop i's point to stop j's (on round)
export function hintBetween(F, i, j) {
  const a = F.stops[i].pt, b = F.stops[j].pt, pts = F.hint;
  if (b > a) return pts.slice(a, b + 1);
  return pts.slice(a).concat(pts.slice(0, b + 1));
}
