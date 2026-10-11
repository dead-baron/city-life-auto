// World v3, stage 2, step 4 (docs/WORLD-V3.md 8.6): the whole v3 world in one build -
// generateCity(seed, { world3: true, frame: { w, h }, land, today }), where land is shared/world3-land.js
// buildLand3(today) and today is today's world built (generateCity(1337); only its w, h, dist and land are read).
// Importing shared/world3-islands.js registers it with map.js (none of it is in the page's code). On the land's layers:
// - every gulf place at its gulf place and size (shared/world3-skeleton.js ISLANDS' and PIECES' `picture`: Metro City +
//   Southbank, Cedar Isle, Westport with Port Westport, the airport, Pelican Key, Northshore) and today's small islands
//   placed whole (shared/world3.js PLACEMENTS). Each position the generator takes from today's world goes through the
//   placement of the piece it belongs to: the piece whose picture has today's district there (Metro City's and Cedar
//   Isle's rectangles overlap, their districts don't), else the small island whose rectangle holds it (`pick`; map.js
//   pin / unpin). What is no piece's (Dry Creek, today's wild land) isn't built: its positions go off the frame (NONE).
// - the mainland as plain ground by its terrain class, with the wild dressing the generator gives wild ground (map.js
//   buildWilds: trees, rocks, scrub by class); no mainland roads yet. Its districts stand in as today's wild ones
//   (STAND_IN) until DISTRICTS3 joins map.js's DISTRICTS.
// - today's roads between today's islands (laid in today's coordinates, placed point by point) are split where they
//   leave one piece for another and cut at the shore (shared/world3-crossings.js joinPlace, which also lays the canal's
//   bridges); the skeleton's crossings between built places are listed in m.world3.crossings for the next step.
import { TILE, T } from './constants.js';
import { Z } from './citylayout.js';
import { measure } from './geom.js';
import { ISLANDS, PIECES, ARTERIALS, PORT_WESTPORT } from './world3-skeleton.js';
import { PLACEMENTS } from './world3.js';
import { WATER3, TERRAIN3 } from './world3-land.js';
import { joinPlace } from './world3-crossings.js';
import { layRoads, roadTunnels } from './world3-roads.js';

// the mainland's districts (DISTRICTS3, 47-56) as today's wild ones for now: Highland Woods, Granite Peaks, Cedar Hills
// (Willow Valley's farmland), Dry Creek Desert, The Islets (grass: the coasts), Smuggler's Rock (Prison Island),
// Lighthouse Rock (the Egret Rocks)
export const STAND_IN = { 47: 29, 48: 33, 49: 40, 50: 41, 51: 33, 52: 20, 53: 20, 54: 20, 55: 15, 56: 19 };
// a TERRAIN3 class as today's wild class (map.js terrainAt: 1 grass, 2 forest, 3 desert, 4 rock, 5 sand): farm and
// marsh as grass, scrub as rock
const CLS = [0, 1, 2, 3, 4, 5, 1, 1, 4];
const NONE = { key: 'none', at: [-1e5, -1e5], from: [0, 0], s: 1, dx: 0, dy: 0, k: -1 };

// The pieces: the gulf's (their pictures) and the small islands placed whole (PLACEMENTS: scale 1, by their rectangle).
export function worldPieces() {
  const out = [];
  for (const I of [...ISLANDS, ...PIECES]) {
    if (!I.picture) continue;
    const { at, from, scale, ids } = I.picture;
    out.push({ key: I.key, name: I.name, at: [at[0], at[1]], from: [from[0], from[1]], s: scale, dx: at[0] - from[0], dy: at[1] - from[1], ids, rect: from });
  }
  for (const I of ISLANDS) {
    if (!I.placement) continue;
    const Q = PLACEMENTS[I.placement];
    out.push({ key: I.key, name: I.name, at: [Q.from[0] + Q.offset[0], Q.from[1] + Q.offset[1]], from: [Q.from[0], Q.from[1]], s: 1, dx: Q.offset[0], dy: Q.offset[1], ids: null, rect: Q.from });
  }
  out.forEach((p, k) => { p.k = k; });
  return out;
}

export function worldOpts(asked) {
  const land3 = asked.land, today = asked.today;
  if (!land3 || !today) throw new Error('world3: pass land (world3-land.js buildLand3(today)) and today (today\'s world: w, h, dist, land)');
  const L = land3.layers, W = land3.w, H = land3.h, N = W * H;
  const W0 = today.w, H0 = today.h, tDist = today.dist, tLand = today.land;
  const pieces = worldPieces();
  const byDist = new Int16Array(256).fill(-1);
  for (const p of pieces) if (p.ids) for (const d of p.ids) byDist[d] = p.k;
  const small = pieces.filter((p) => !p.ids);
  // today's tile -> its piece: by today's district there, else the small island whose rectangle holds it; null on
  // today's water (placeLine: a road's point there takes its neighbours' piece), NONE on land no piece builds
  const pieceAt = (x, y) => {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!(tx >= 0 && ty >= 0 && tx < W0 && ty < H0)) return NONE;
    const i = ty * W0 + tx;
    if (!tLand[i]) return null;
    const k = byDist[tDist[i]];
    if (k >= 0) return pieces[k];
    for (const p of small) if (tx >= p.rect[0] && ty >= p.rect[1] && tx < p.rect[2] && ty < p.rect[3]) return p;
    return NONE;
  };
  // (a position on today's water - a pier, a spot by the shore - takes the piece of the nearest land within 8 tiles)
  const pick = (x, y) => {
    const p = pieceAt(x, y);
    if (p) return p;
    for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx += (Math.abs(dy) === r ? 1 : 2 * r)) { const q = pieceAt(x + dx, y + dy); if (q) return q; }
    return NONE;
  };
  // a line laid in today's coordinates (px), placed point by point by its piece; a point over today's water takes the
  // piece of the point before it, else after it (a bridge's deck goes with its shore). p.pc: the piece's index.
  const placeLine = (pts, seen) => {
    const pc = pts.map((p) => (seen.has(p) ? undefined : pieceAt(p.x / TILE, p.y / TILE)));
    for (let j = 1; j < pts.length; j++) if (pc[j] === null && pc[j - 1]) pc[j] = pc[j - 1];
    for (let j = pts.length - 1; j--;) if (pc[j] === null && pc[j + 1]) pc[j] = pc[j + 1];
    pts.forEach((p, j) => {
      const q = pc[j] === null ? NONE : pc[j];
      if (!q) return;   // (placed already)
      seen.add(p);
      p.x = (q.at[0] + (p.x / TILE - q.from[0]) * q.s) * TILE; p.y = (q.at[1] + (p.y / TILE - q.from[1]) * q.s) * TILE;
      p.pc = q.k;
    });
  };
  // the terrain class of a frame tile: a piece's tile reads today's picture back (f: today's x, y -> class), the
  // mainland's its class in the land layer
  const cls = (tx, ty, f) => {
    if (!(tx >= 0 && ty >= 0 && tx < W && ty < H)) return 0;
    const i = ty * W + tx, d = L.dist[i], k = byDist[d];
    const p = k >= 0 ? pieces[k] : d < 47 ? small.find((q) => tx >= q.rect[0] + q.dx && ty >= q.rect[1] + q.dy && tx < q.rect[2] + q.dx && ty < q.rect[3] + q.dy) : null;
    if (p) return f(Math.floor(p.from[0] + (tx - p.at[0]) / p.s), Math.floor(p.from[1] + (ty - p.at[1]) / p.s));
    return CLS[L.terrain[i]] ?? 1;
  };
  const base = pieces.find((p) => p.key === 'metro');
  const built = new Set();
  const metro = ISLANDS.find((I) => I.key === 'metro');
  const box = [W, H, 0, 0];
  for (const [x, y] of metro.poly) { box[0] = Math.min(box[0], x - 40); box[1] = Math.min(box[1], y - 40); box[2] = Math.max(box[2], x + 40); box[3] = Math.max(box[3], y + 40); }
  const o = {
    world: { pick, base, placeLine, cls, pieces },
    place: base,
    islandAt: [],
    noRail: true,     // (the railway is the skeleton's main line now)
    ownRiver: true,   // (the inland water is the land's)
    box,              // (map.js's coast drives reach Metro City's new east shore)
    quays: [{ name: 'Port Westport', rect: PORT_WESTPORT.rect, faces: PORT_WESTPORT.faces, freight: 'Westport Freight' }],
    land(land, m) {
      if (m.w !== W || m.h !== H) throw new Error(`world3: the frame must be the land's (${W} x ${H})`);
      for (let i = 0; i < N; i++) { land[i] = L.land[i]; if (L.land[i]) built.add(L.dist[i]); }
      // inland water is river water (shallow, fresh: the Long Reach, the lakes, the streams, the canal); the canal's
      // within 12 tiles of the open sea is the sea's, and so is what that leaves of it apart from its body (8.4)
      let cx0 = W, cy0 = H, cx1 = 0, cy1 = 0;
      for (let i = 0; i < N; i++) {
        const w = L.water[i];
        if (w !== WATER3.CANAL && w !== WATER3.RIVER && w !== WATER3.LAKE && w !== WATER3.STREAM) continue;
        m.river[i] = 1;
        if (w === WATER3.CANAL) { const x = i % W, y = (i / W) | 0; if (x < cx0) cx0 = x; if (y < cy0) cy0 = y; if (x >= cx1) cx1 = x + 1; if (y >= cy1) cy1 = y + 1; }
      }
      if (cx1 > cx0) {
        const BW = cx1 - cx0 + 2, BH = cy1 - cy0 + 2, bx = cx0 - 1, by = cy0 - 1;
        const canal = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m.river[y * W + x] === 1 && L.water[y * W + x] === WATER3.CANAL;
        const dd = new Int16Array(BW * BH).fill(-1), q = [];
        for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
          if (!canal(x, y)) continue;
          for (const [ax, ay] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { const w = L.water[ay * W + ax]; if (w === WATER3.SEA || w === WATER3.DEEP) { dd[(y - by) * BW + x - bx] = 0; q.push([x, y]); break; } }
        }
        for (let h = 0; h < q.length; h++) {
          const [x, y] = q[h], d = dd[(y - by) * BW + x - bx];
          if (d >= 12) continue;
          for (const [ax, ay] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { const j = (ay - by) * BW + ax - bx; if (canal(ax, ay) && dd[j] < 0) { dd[j] = d + 1; q.push([ax, ay]); } }
        }
        for (const [x, y] of q) m.river[y * W + x] = 0;
        const comp = new Int32Array(BW * BH).fill(-1), sizes = [];
        for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
          if (!canal(x, y) || comp[(y - by) * BW + x - bx] >= 0) continue;
          const c = sizes.length, st = [[x, y]];
          comp[(y - by) * BW + x - bx] = c; let n = 0;
          while (st.length) { const [px, py] = st.pop(); n++; for (const [ax, ay] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) { const j = (ay - by) * BW + ax - bx; if (canal(ax, ay) && comp[j] < 0) { comp[j] = c; st.push([ax, ay]); } } }
          sizes.push(n);
        }
        const body = sizes.indexOf(Math.max(...sizes, 0));
        for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (canal(x, y) && comp[(y - by) * BW + x - bx] !== body) m.river[y * W + x] = 0;
      }
    },
    zones(m) { for (let i = 0; i < N; i++) if (m.land[i]) { const z = L.zone[i]; m.zone[i] = z >= 11 ? Z.WILD : z; } },
    dists(m) {
      for (let i = 0; i < N; i++) {
        if (!m.land[i]) continue;
        const d = L.dist[i];
        m.dist[i] = STAND_IN[d] ?? d;
        if (d >= 47 && L.terrain[i] === TERRAIN3.SAND) m.tiles[i] = T.SAND;   // (the mainland's beaches)
      }
    },
    // a planned business is built when its district is (Westport Freight's: Port Westport's new ground)
    special: (sp) => built.has(sp.d),
    tunnels: (m) => roadTunnels(m),   // (the skeleton's tunnels on the built edges: shared/world3-roads.js)
    lines(lines, m) {
      const out = { split: 0, offFrame: 0 };
      const inF = (p) => p.x >= 0 && p.y >= 0 && p.x < W * TILE && p.y < H * TILE;
      for (let k = lines.length; k--;) {
        const l = lines[k], parts = [];
        let run = [];
        for (let j = 0; j < l.pts.length; j++) {
          const p = l.pts[j], prev = l.pts[j - 1];
          // (off the frame: a piece no build makes; and where a road of today's leaves one piece for another)
          const brk = !inF(p) || (prev && p.pc !== undefined && prev.pc !== undefined && p.pc !== prev.pc);
          if (brk) { if (run.length > 1) parts.push(run); if (!inF(p)) { out.offFrame++; run = []; continue; } out.split++; run = [p]; continue; }
          run.push(p);
        }
        if (run.length > 1) parts.push(run);
        if (parts.length === 1 && parts[0].length === l.pts.length) continue;
        lines.splice(k, 1, ...parts.map((pts) => { const q = pts.map((p) => ({ ...p })); measure(q); return { ...l, pts: q }; }));
      }
      const own = new Uint8Array(N);
      for (let i = 0; i < N; i++) own[i] = m.land[i];
      const j = joinPlace(lines, m, own, true);
      // the skeleton's crossings between built places: both ends on land, over the sea between (listed: the next step)
      const isLand = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const tx = Math.round(x + dx), ty = Math.round(y + dy); if (tx >= 0 && ty >= 0 && tx < W && ty < H && m.land[ty * W + tx]) return true; } return false; };
      const sea = (x, y) => { const tx = Math.round(x), ty = Math.round(y); if (!(tx >= 0 && ty >= 0 && tx < W && ty < H)) return false; const w = L.water[ty * W + tx]; return w === WATER3.SEA || w === WATER3.DEEP; };
      const crossings = [];
      for (const A of ARTERIALS) {
        if (/^Canal /.test(A.name)) continue;
        const a = A.pts[0], b = A.pts[A.pts.length - 1];
        if (!isLand(a[0], a[1]) || !isLand(b[0], b[1])) continue;
        let wet = 0, len = 0;
        for (let s = 0; s + 1 < A.pts.length; s++) {
          const [x0, y0] = A.pts[s], [x1, y1] = A.pts[s + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
          len += Math.hypot(x1 - x0, y1 - y0);
          for (let t = 0; t < n; t++) if (sea(x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n)) wet++;
        }
        if (wet) crossings.push({ name: A.name, foot: !!A.foot, from: a, to: b, len: Math.round(len), water: wet });
      }
      m.world3 = { pieces: pieces.map((p) => ({ key: p.key, at: p.at, s: p.s })), split: out.split, offFrame: out.offFrame, cut: j.cut, dropped: j.dropped, bridged: j.bridged, canal: j.canal, crossings };
      m.world3.roads = layRoads(lines, m, L);   // (the skeleton's highways and arterials: shared/world3-roads.js, 8.7)
    },
  };
  return o;
}
