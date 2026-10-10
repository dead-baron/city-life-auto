// Rest spots in the wilds (tasks #341, #396; concepts CF2-A, CF2-B). The owner: "little campfire spots far out in
// the wilderness away from all development, usually off a trail, sometimes by a view, sometimes in the middle of
// nowhere, beautiful ambience" and "more scenic campfire spots for players to find and relax at".
//
// Placed by rules, never coordinates, so they hold up when the land is rebuilt: a coarse grid of candidate spots
// over the wild districts (hash2 jitter, nothing random), each one kept only if it is a long way from anything
// built (roads, buildings, lots, fields, docks, the designed places and their camps), on open ground with room for
// a clearing. Each candidate is one of three kinds:
//   trail - a few strides off a hiking trail, a dirt road or a track (a footpath runs from the trail to the fire);
//   view  - over water: a lakeshore, a river bend or the sea below a bluff (CF2-A's cliff-top, the misty lakeshore);
//   wild  - the middle of nowhere: far from trails and everything else.
// The best of each kind are taken in turn, spaced well apart. A spot is a small dirt clearing with a campfire (a
// ring of stones; some still burning, as if someone just left), a seat log or two, a few rocks and flowers round
// the edge; the wild trees keep off it (reserve bit 32). The fires are ordinary campfire props, so they work like
// every other (server/systems/campfires.js: light, sit, heal; the calm HUD). m.restSpots lists them (the
// fireflies gather at them now and then: client/render/fireflies.js).
import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { hash2 } from './rng.js';

const RES = 32;
const CELL = 8;                          // the development grid (tiles per cell: 256 px)
const GW = Math.ceil(MAP_W / CELL), GH = Math.ceil(MAP_H / CELL);
const STEP = 7;                          // candidate spacing (tiles), jittered
const DEV_MIN = 850;                     // px from anything built, for a spot off a trail
const VIEW_MIN = 1000;                   // for one by a view
const WILD_MIN = 1750;                   // and for one in the middle of nowhere
const SPACING = 1500;                    // px between rest spots
const FIRE_GAP = 1000;                   // px from any campfire already on the map
const BUILT_GAP = 800;                   // px from the nearest building's walls (checked exactly)
const PER_DISTRICT = 5;                  // spots in any one district at most
export const REST_CAPS = { view: 7, trail: 12, wild: 5 };
const WILD_STYLE = new Set(['wild', 'rocky', 'desert', 'rural']);
const DEV_TILES = new Set([T.ROAD, T.SIDEWALK, T.PLAZA, T.BUILDING, T.DOCK, T.FIELD, T.BRIDGE, T.LOT, T.FLOOR, T.COUNTER, T.WALL]);

// stamp a polyline into a tile mask (radius r px)
function stampLine(mask, pts, r, val = 1) {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const ax = a.x ?? a[0], ay = a.y ?? a[1], bx = b.x ?? b[0], by = b.y ?? b[1];
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 16));
    for (let s = 0; s <= n; s++) {
      const x = ax + (bx - ax) * s / n, y = ay + (by - ay) * s / n;
      for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
        if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) mask[ty * MAP_W + tx] = val;
      }
    }
  }
}

// distance (in cells, 8-connected chamfer) from every cell to the nearest marked one
function cellDistance(marked) {
  const D = new Float32Array(GW * GH).fill(1e9);
  for (let i = 0; i < D.length; i++) if (marked[i]) D[i] = 0;
  const S = Math.SQRT2;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x; let d = D[i];
    if (x > 0) d = Math.min(d, D[i - 1] + 1);
    if (y > 0) { d = Math.min(d, D[i - GW] + 1); if (x > 0) d = Math.min(d, D[i - GW - 1] + S); if (x < GW - 1) d = Math.min(d, D[i - GW + 1] + S); }
    D[i] = d;
  }
  for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) {
    const i = y * GW + x; let d = D[i];
    if (x < GW - 1) d = Math.min(d, D[i + 1] + 1);
    if (y < GH - 1) { d = Math.min(d, D[i + GW] + 1); if (x < GW - 1) d = Math.min(d, D[i + GW + 1] + S); if (x > 0) d = Math.min(d, D[i + GW - 1] + S); }
    D[i] = d;
  }
  return D;
}

// H: { addProp(m, t, x, y, solidR, extra) }; paint(m, x, y, r, tile, ok), reserveRound(m, x, y, r): naturesites.js's
export function buildRestSpots(m, H, paint, reserveRound) {
  const W = MAP_W, styles = m._distStyle || [];
  // what counts as a trail: the hiking trails (dirt the nature sites laid, reserve bit 32), the dirt roads, the tracks
  const trail = new Uint8Array(W * MAP_H);
  for (let i = 0; i < trail.length; i++) if (m.tiles[i] === T.DIRT && (m.reserve[i] & RES)) trail[i] = 1;
  for (const e of m.edges || []) if (e.kind === 'dirt') stampLine(trail, e.pts, (e.hw || 64) + 8);
  for (const r of m.tracks || []) stampLine(trail, r.pts, (r.hw || 26) + 8);
  // what counts as built: paved ground, buildings, lots, fields, docks, anything reserved but a trail; the designed
  // places, the campfires, the counters and the parking
  const dev = new Uint8Array(GW * GH);
  const mark = (x, y) => { const cx = Math.floor(x / TILE / CELL), cy = Math.floor(y / TILE / CELL); if (cx >= 0 && cy >= 0 && cx < GW && cy < GH) dev[cy * GW + cx] = 1; };
  for (let i = 0; i < m.tiles.length; i++) {
    if (trail[i]) continue;
    if (DEV_TILES.has(m.tiles[i])) { const tx = i % W, ty = (i - tx) / W; dev[Math.floor(ty / CELL) * GW + Math.floor(tx / CELL)] = 1; }
  }
  for (const b of m.buildings || []) mark((b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE);
  for (const s of m.natureSites || []) mark(s.x, s.y);
  for (const p of m.pois || []) mark(p.x, p.y);
  for (const p of m.parking || []) mark(p.x, p.y);
  const fires = [];
  for (const p of m.props) if (p && (p.t === 'campfire' || p.t === 'tent')) { mark(p.x, p.y); if (p.t === 'campfire') fires.push(p); }
  const devD = cellDistance(dev);
  const devAt = (x, y) => devD[Math.floor(y / TILE / CELL) * GW + Math.floor(x / TILE / CELL)] * CELL * TILE;
  const waterT = (t) => t === T.WATER || t === T.DEEP;
  const groundOk = (i, desert) => { const t = m.tiles[i]; return t === T.GRASS || t === T.DIRT || (desert && t === T.SAND); };

  // the candidates
  const cands = [];
  for (let gy = 6; gy < MAP_H - 12; gy += STEP) for (let gx = 6; gx < W - 12; gx += STEP) {
    const tx = gx + Math.floor(hash2(gx, gy, 411) * STEP), ty = gy + Math.floor(hash2(gx, gy, 412) * STEP), i = ty * W + tx;
    const style = styles[m.dist[i]];
    if (!WILD_STYLE.has(style) || !m.land[i]) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, dd = devAt(x, y);
    if (dd < DEV_MIN) continue;
    const desert = style === 'desert';
    // room for the clearing: open ground 4 tiles round, nothing reserved, no water, no field
    let ok = true;
    for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4 && ok; dx++) {
      const j = (ty + dy) * W + tx + dx;
      if (!groundOk(j, desert) || m.reserve[j] || trail[j] || m.lake[j] || m.river[j]) ok = false;
    }
    if (!ok) continue;
    if (style === 'rural' && dd < WILD_MIN) continue;   // (farm country: only far out)
    // the nearest trail (within 9 tiles) and the water in view (within 11 tiles, none closer than 3)
    let tr = 99, water = 0;
    for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) {
      const d = Math.hypot(dx, dy), j = (ty + dy) * W + tx + dx;
      if (d > 11 || j < 0 || j >= trail.length) continue;
      if (trail[j] && d < tr) tr = d;
      if (waterT(m.tiles[j])) { if (d < 3) { water = -999; } else water += m.lake[j] || m.river[j] ? 2 : 1; }   // (a lake or a river counts double)
    }
    if (water < 0) continue;
    let kind = null, score = 0;
    if (water >= 50 && dd >= VIEW_MIN) { kind = 'view'; score = Math.min(water, 200) + dd / 100; }
    else if (tr >= 3 && tr <= 8) { kind = 'trail'; score = 60 - tr * 3 + dd / 100; }
    else if (tr > 11 && dd >= WILD_MIN) { kind = 'wild'; score = dd / 100; }
    if (!kind) continue;
    cands.push({ x, y, tx, ty, kind, score: score + hash2(tx, ty, 413) * 8, trail: tr, desert });
  }
  // the best of each kind, spaced apart (the order is fixed: no shared random stream)
  const spots = m.restSpots = [];
  const bc = (m.buildings || []).map((b) => [(b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE, Math.max(b.tw, b.th) * TILE / 2]);
  const perDist = new Map();
  const far = (c) => spots.every((s) => Math.hypot(s.x - c.x, s.y - c.y) >= SPACING) && fires.every((f) => Math.hypot(f.x - c.x, f.y - c.y) >= FIRE_GAP)
    && (perDist.get(m.dist[c.ty * W + c.tx]) || 0) < PER_DISTRICT && bc.every(([x, y, r]) => Math.hypot(x - c.x, y - c.y) - r >= BUILT_GAP);
  for (const kind of ['view', 'trail', 'wild']) {
    const list = cands.filter((c) => c.kind === kind).sort((a, b) => b.score - a.score || a.ty - b.ty || a.tx - b.tx);
    let n = 0;
    for (const c of list) { if (n >= REST_CAPS[kind]) break; if (far(c)) { spots.push(c); n++; const d = m.dist[c.ty * W + c.tx]; perDist.set(d, (perDist.get(d) || 0) + 1); } }
  }
  for (const c of spots) layOut(m, H, c, trail, paint, reserveRound);
  m.restSpots = spots.map((c) => Object.defineProperty({ x: c.x, y: c.y, kind: c.kind, lit: c.lit }, '_items', { value: c.items, enumerable: false }));
}

// Once the whole world is built (map.js, at the very end): a spot that something was built near afterwards (a den
// on a rocky islet, a shop) is taken away again - its props become painted placeholders, so every other prop keeps
// its index - and m.restSpots keeps the rest.
export function pruneRestSpots(m) {
  if (!m.restSpots) return;
  const bc = (m.buildings || []).map((b) => [(b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE, Math.max(b.tw, b.th) * TILE / 2]);
  m.restSpots = m.restSpots.filter((s) => {
    if (bc.every(([x, y, r]) => Math.hypot(x - s.x, y - s.y) - r >= BUILT_GAP) && (m.pois || []).every((q) => Math.hypot(q.x - s.x, q.y - s.y) >= BUILT_GAP)) return true;
    for (const p of s._items || []) {
      const i = m.props.indexOf(p);
      if (i < 0) continue;
      const e = m.propSolid && m.propSolid.get(i);
      if (e && (e.pi === undefined || e.pi === i)) {
        const own = m.solidProps.get(Math.floor(e.y / TILE) * MAP_W + Math.floor(e.x / TILE)), k = own ? own.indexOf(e) : -1;
        if (k >= 0) own.splice(k, 1);
        m.propSolid.delete(i);
      }
      m.props[i] = { t: 'painted', x: p.x, y: p.y };
    }
    return false;
  });
}

// one rest spot: the clearing, the fire, the seats, the rocks and flowers round it, the footpath from the trail
function layOut(m, H, c, trail, paint, reserveRound) {
  const { x: X, y: Y, tx, ty } = c, h = (k) => hash2(tx, ty, 420 + k);
  const items = c.items = [], add = (...a) => items.push(H.addProp(m, ...a));
  const ground = (t) => t === T.GRASS || t === T.DIRT || t === T.SAND;
  paint(m, X, Y, 74, T.DIRT, ground);
  reserveRound(m, X, Y, 150);
  // the footpath from the nearest trail tile
  if (c.kind === 'trail') {
    let best = null, bd = 1e9;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) { const j = (ty + dy) * MAP_W + tx + dx; const d = Math.hypot(dx, dy); if (trail[j] && d < bd) { bd = d; best = [dx, dy]; } }
    if (best) {
      const ex = (tx + best[0] + 0.5) * TILE, ey = (ty + best[1] + 0.5) * TILE, L = Math.hypot(ex - X, ey - Y);
      for (let s = 60; s <= L; s += 12) { const k = s / L; paint(m, X + (ex - X) * k + Math.sin(k * 6 + h(9) * 6) * 10, Y + (ey - Y) * k, 18, T.DIRT, ground); }
    }
  }
  // the fire: about one in three still burning, as if someone had just moved on
  const lit = h(0) < 0.35;
  add('campfire', X, Y, 0, { lit, rest: 1 });
  c.lit = lit;
  // the seats: a log on one side, often another across the fire
  const a0 = h(1) * Math.PI * 2, seats = h(2) < 0.7 ? 2 : 1;
  for (let k = 0; k < seats; k++) {
    const a = a0 + k * (Math.PI * (0.8 + h(3) * 0.4)), r = 50 + h(4 + k) * 8;
    const lx = X + Math.cos(a) * r, ly = Y + Math.sin(a) * r * 0.85;
    add('log', Math.round(lx), Math.round(ly), 8, { len: 80 + Math.floor(h(6 + k) * 2) * 20, a: Math.round(((a + Math.PI / 2) % Math.PI) * 100) / 100, seat: 1 });
  }
  // rocks and flowers round the edge of the clearing
  const nR = 2 + Math.floor(h(10) * 3);
  for (let k = 0; k < nR; k++) {
    const a = a0 + Math.PI * 0.35 + k * (Math.PI * 2 / nR) + h(11 + k) * 0.6, r = 92 + h(16 + k) * 26, s = 22 + Math.floor(h(21 + k) * 3) * 6;
    add('boulder', Math.round(X + Math.cos(a) * r), Math.round(Y + Math.sin(a) * r * 0.85), Math.round(s * 0.45), { s });
  }
  const nF = 3 + Math.floor(h(26) * 3);
  for (let k = 0; k < nF; k++) {
    const a = h(27 + k) * Math.PI * 2, r = 80 + h(33 + k) * 40;
    const kind = c.desert ? (k % 2 ? 'bush_a' : 'shrub_b') : k % 3 === 2 ? 'shrub_a' : 'flowers_a';
    add(kind, Math.round(X + Math.cos(a) * r), Math.round(Y + Math.sin(a) * r * 0.85), 0);
  }
}
