// The forklift yards' loading bays (the owner, 11-06: "We should have it make you take the pallets further away into a
// clear marked loading bay area"). One pass of the generator (shared/map.js, near its end, once the yards' props, the
// warehouses and their lots are all down) works out, for every yard the forklift job runs at (yardSites: the forklifts
// parked about the port's container yard, the warehouses and the fish markets - not the airport's ground crews' - and
// each warehouse's door), two places on its open ground:
//   - the pallets' row (pick): where a shift's pallets wait, near the yard's forklift or door, a strip in front of it
//     for the forks to come at them;
//   - the loading bay (bay): a row of numbered slots (BAY.slots, two pallets to a slot, the second stacked) further across
//     the yard - BAY.route tiles away by the way a forklift drives there - backed, where the yard has one, against a
//     building's wall (a warehouse's dock doors), with room in front to drive in.
// The way between them (route: the tiles a forklift drives, each with a tile of room either side) runs over the yard's
// paved ground - its lot, its quay or its plaza, the street only where it must - and is clear of buildings, walls, water,
// every prop and fence, and the parking bays (a parked car's place). m.loadBays: [{ yard: { x, y, name, poi }, pick: { x,
// y, ax, ay, fx, fy, pallets: [{ x, y }] }, bay: { x, y, ax, ay, fx, fy, w, d, slots: [{ x, y }], sign: { x, y }, lamps:
// [{ x, y }] }, route: [[tx, ty], ...], len }] - ax, ay the row's axis; fx, fy the way the forks face going in (from
// the open side toward the pallets, toward the bay's back). All of it data: the server's forklift job reads it
// (server/systems/forklift.js), the art paints it (client/art2/game/groundbake.js loadBays: the slots' white lines and
// numbers, the hazard stripes, LOADING BAY across the apron, the pallets' corner marks) and stands its sign and its
// floodlights (statics.js: lit at night). Nothing on the map's tiles or props changes (the map's signature stays).
// Deterministic like the rest of the generator: tiles, props and integer arithmetic only, the same scan order every time.
import { T, TILE } from './constants.js';

// the geometry (px): a shift's `pallets` in a row at `rowGap`; half as many slots, `slotW` wide and `slotD` deep; the way
// there route[0]-route[1] tiles (the forklift's drive, carrying the load - about `aim` if it can; the job's FORK.drive,
// shared/rules-work.js, is this); the pallets within `pickR` tiles of the yard's forklift or door; the plan looks
// `search` tiles each way; `apron` tiles of room in front of the row and the bay. (No imports but the constants: the
// generator's code is in the page's fallback - tools/perf.mjs city)
export const BAY = { pallets: 6, rowGap: 46, slots: 3, slotW: 60, slotD: 64, route: [25, 60], aim: 40, pickR: 24, search: 76, apron: 2 };

// the props drawn as a fence run (shared/fences.js fenceKindOf / fenceEnds: a forklift doesn't drive through one)
function fenceSegments(m) {
  const out = [];
  for (const p of m.props || []) {
    if (!p || !(p.t === 'fenceline' || p.t === 'chainfence' || p.t === 'yfence' || p.t === 'hedgerun' || p.t === 'rail')) continue;
    const s = p.t === 'yfence' ? { x0: p.x, y0: p.y, x1: p.x1 ?? p.x, y1: p.y1 ?? p.y } : { x0: p.x, y0: p.y, x1: p.x + (p.tx || 0), y1: p.y + (p.ty || 0) };
    if (Math.abs(s.x1 - s.x0) + Math.abs(s.y1 - s.y0) >= 2) out.push(s);
  }
  return out;
}

// The yards: a forklift prop (not the airport apron's) - one yard for any within 500 px of each other - and each
// warehouse's door away from those. { x, y, name, poi }
export function yardSites(m) {
  const L = [];
  for (const q of m.props || []) {
    if (!q || q.t !== 'forklift' || L.some((y) => Math.hypot(y.x - q.x, y.y - q.y) < 500)) continue;
    const d = m.districtAt(q.x, q.y);
    if (d && d.style === 'airport') continue;   // (the airport apron's ground crews' forklifts: not a yard)
    // (named for the business it's at - a freight firm's, a fish market's - or the part of town)
    let at = null, ad = 640;
    for (const p of m.pois || []) { if (!YARD_OF.has(p.kind)) continue; const dd = Math.hypot(p.x - q.x, p.y - q.y); if (dd < ad) { ad = dd; at = p; } }
    const dn = d && d.name ? d.name.replace(/^The /, '') : '';
    L.push({ x: q.x, y: q.y, name: at ? `the ${at.label} yard` : /yard/i.test(dn) ? `the ${dn} freight depot` : `the ${dn ? dn + ' ' : ''}yard` });
  }
  for (const q of m.pois || []) if (q.kind === 'warehouse' && !L.some((y) => Math.hypot(y.x - q.x, y.y - q.y) < 500)) L.push({ x: q.x, y: q.y, name: q.label, poi: true });
  // (two yards of one name: which side of town each is on)
  const groups = new Map();
  for (const y of L) { if (!groups.has(y.name)) groups.set(y.name, []); groups.get(y.name).push(y); }
  for (const same of groups.values()) {
    if (same.length < 2) continue;
    const cx = same.reduce((a, o) => a + o.x, 0) / same.length, cy = same.reduce((a, o) => a + o.y, 0) / same.length;
    const ew = Math.max(...same.map((o) => Math.abs(o.x - cx))) >= Math.max(...same.map((o) => Math.abs(o.y - cy)));
    const W = ew ? ['west', 'middle', 'east'] : ['north', 'middle', 'south'];
    same.slice().sort((a, b) => (ew ? a.x - b.x : a.y - b.y)).forEach((o, i, all) => { o.name = `${o.name} (${all.length === 2 ? W[i * 2] : all.length === 3 ? W[i] : i + 1})`; });
  }
  return L;
}
const YARD_OF = new Set(['delivery', 'warehouse', 'fishmarket', 'market', 'salvage']);

const LEAFY = /^(tree|palm|pine|oak|bush|shrub|hedge|cypress|willow|birch|maple|fir|cedar)/;   // (props with a crown)
const BULKY = new Set(['forklift', 'container', 'boxtruck', 'trailer', 'truck', 'van', 'boat', 'crane', 'dumpster', 'dump_g', 'dump_b', 'dump_o', 'pallets', 'crates', 'pipes', 'lumber']);
const LEE = 4;   // tiles north of a building in its lee
// props that lie flat on the ground (painted marks, a manhole's lid): a forklift drives over them
const FLAT = new Set(['painted', 'manhole', 'drain', 'oil', 'puddle', 'stain', 'leaves', 'decal', 'crack', 'hopscotch', 'grate']);
// the yard's ground: 1 its own (a lot, a quay, a plaza), 2 passable at a cost (a street, a pavement, a dirt track), 0 not
const GROUND = new Uint8Array(16);
GROUND[T.LOT] = 1; GROUND[T.DOCK] = 1; GROUND[T.PLAZA] = 1;
GROUND[T.ROAD] = 2; GROUND[T.SIDEWALK] = 2; GROUND[T.DIRT] = 2;
// (a yard with no paved ground of its own big enough - a warehouse's grass court: its grass and dirt are the yard's)
const OPEN = GROUND.slice(); OPEN[T.GRASS] = 1; OPEN[T.DIRT] = 1;

// the props and the solid props in each of a list of boxes [x0, y0, x1, y1] (px): one pass over the map's
function nearOf(m, boxes) {
  const out = boxes.map(() => ({ props: [], solid: [] }));
  const lo = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const each = (x, y, f) => { if (x < lo[0] || x > lo[2] || y < lo[1] || y > lo[3]) return; for (let k = 0; k < boxes.length; k++) { const b = boxes[k]; if (x > b[0] && x < b[2] && y > b[1] && y < b[3]) f(out[k]); } };
  for (const p of m.props) if (p) each(p.x, p.y, (o) => o.props.push(p));
  for (const [, arr] of m.solidProps) for (const e of arr) each(e.x, e.y, (o) => o.solid.push(e));
  return out;
}
const boxOf = (y) => { const ox = Math.floor(y.x / TILE), oy = Math.floor(y.y / TILE), R = BAY.search; return [(ox - R) * TILE - 64, (oy - R) * TILE - 64, (ox + R + 1) * TILE + 64, (oy + R + 1) * TILE + 64]; };

// The grid round one yard: R tiles each way of (ox, oy). g: 0 not passable, 1 / 2 as GROUND, less anything on it
function yardGrid(m, ox, oy, R, ctx) {
  const N = 2 * R + 1, x0 = ox - R, y0 = oy - R, g = new Uint8Array(N * N), wall = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const tx = x0 + i, ty = y0 + j;
    if (!m.inside(tx, ty)) continue;
    const t = m.tiles[m.idx(tx, ty)];
    g[j * N + i] = (ctx.open ? OPEN : GROUND)[t];
    if (t === T.BUILDING || t === T.WALL) wall[j * N + i] = 1;
  }
  const off = (x, y, r) => {   // (px: everything within r of (x, y) taken out)
    const a = Math.floor((x - r) / TILE) - x0, b = Math.floor((x + r) / TILE) - x0, c = Math.floor((y - r) / TILE) - y0, d = Math.floor((y + r) / TILE) - y0;
    for (let j = Math.max(0, c); j <= Math.min(N - 1, d); j++) for (let i = Math.max(0, a); i <= Math.min(N - 1, b); i++) g[j * N + i] = 0;
  };
  const X0 = x0 * TILE - 64, Y0 = y0 * TILE - 64, X1 = (x0 + N) * TILE + 64, Y1 = (y0 + N) * TILE + 64;
  const near = ctx.near || nearOf(m, [[X0, Y0, X1, Y1]])[0];   // (the props and the solid ones in the yard's box)
  for (const p of near.props) if (!FLAT.has(p.t) && p.x > X0 && p.x < X1 && p.y > Y0 && p.y < Y1) off(p.x, p.y, LEAFY.test(p.t) || BULKY.has(p.t) ? 40 : 16);   // (a tree's crown over the way as much as its trunk; a parked forklift, a container, a truck: their length)
  for (const e of near.solid) if (!e.off && e.x > X0 && e.x < X1 && e.y > Y0 && e.y < Y1) off(e.x, e.y, e.r + 4);
  for (const s of ctx.fences) {
    if (Math.max(s.x0, s.x1) < X0 || Math.min(s.x0, s.x1) > X1 || Math.max(s.y0, s.y1) < Y0 || Math.min(s.y0, s.y1) > Y1) continue;
    const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), n = Math.max(1, Math.ceil(L / 8));
    for (let k = 0; k <= n; k++) off(s.x0 + (s.x1 - s.x0) * k / n, s.y0 + (s.y1 - s.y0) * k / n, 4);
  }
  for (const sp of m.parking || []) if (sp && sp.x > X0 && sp.x < X1 && sp.y > Y0 && sp.y < Y1) off(sp.x, sp.y, 40);   // (a parked car's place)
  for (const gt of m.gates || []) if (gt && Number.isFinite(gt.x) && gt.x > X0 && gt.x < X1 && gt.y > Y0 && gt.y < Y1) off(gt.x, gt.y, 48);
  // room: a tile with every tile round it passable (the forklift's lane, a tile spare either side)
  const room = new Uint8Array(N * N);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    let ok = 1, worst = 1;
    for (let dj = -1; dj <= 1 && ok; dj++) for (let di = -1; di <= 1; di++) { const v = g[(j + dj) * N + i + di]; if (!v) { ok = 0; break; } if (v > worst) worst = v; }
    if (ok) room[j * N + i] = worst;
  }
  // (in the lee of a building: the ground a few tiles north of one is behind it as the camera sees it - the bay, the
  // pallets and the forklift at them would be under its roof)
  const lee = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) for (let j = N - 1, run = 99; j >= 0; j--) { run = wall[j * N + i] ? 0 : run + 1; if (run >= 1 && run <= LEE) lee[j * N + i] = 1; }
  return { N, x0, y0, g, room, wall, lee };
}

// a rectangle of tiles [i0, j0] .. [i1, j1] (inclusive): every one passable at `want` (1: the yard's own ground) or better,
// and in plain view (not in a building's lee)
function allOf(G, arr, i0, j0, i1, j1, want) {
  if (i0 < 0 || j0 < 0 || i1 >= G.N || j1 >= G.N) return false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * G.N + i, v = arr[k]; if (!v || v > want || G.lee[k]) return false; }
  return true;
}
// the tiles a box of px (centre x, y; half extents hx, hy) covers, in the grid
const boxTiles = (G, x, y, hx, hy) => [Math.floor((x - hx) / TILE) - G.x0, Math.floor((y - hy) / TILE) - G.y0, Math.floor((x + hx - 1) / TILE) - G.x0, Math.floor((y + hy - 1) / TILE) - G.y0];
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// A row of things (n at gap px) with its front toward (fx, fy): where each is, the box they cover, the apron in front
// (depth tiles deep) - all of it in tiles of the grid. cx, cy: the row's middle (px)
function rowAt(G, cx, cy, ax, ay, fx, fy, n, gap, half, deep, apron) {
  const along = ((n - 1) * gap) / 2 + half, hx = ax ? along : deep / 2, hy = ay ? along : deep / 2;
  const foot = boxTiles(G, cx, cy, hx, hy);
  // the apron: the strip of tiles in front of the row, apron tiles deep, as wide as the row
  const ex = fx * (deep / 2 + (apron * TILE) / 2), ey = fy * (deep / 2 + (apron * TILE) / 2);
  const ap = boxTiles(G, cx + ex, cy + ey, ax ? along : (apron * TILE) / 2, ay ? along : (apron * TILE) / 2);
  return { foot, ap };
}
// where each of a row's n things is (gap px apart along ax, ay from its middle cx, cy)
const rowItems = (cx, cy, ax, ay, n, gap) => Array.from({ length: n }, (_, k) => ({ x: Math.round(cx + ax * (k - (n - 1) / 2) * gap), y: Math.round(cy + ay * (k - (n - 1) / 2) * gap) }));

// Dijkstra from the apron's tiles over the tiles with room (cost 2 on the street, 3 diagonally): the cost to each, and
// where it came from
function drive(G, starts) {
  const N = G.N, dist = new Float64Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1);
  const heap = [];   // (a binary heap of [cost, cell])
  const push = (c, k) => { heap.push([c, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1] <= heap[i][1])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; for (const c of [l, r]) if (c < heap.length && (heap[c][0] < heap[s][0] || (heap[c][0] === heap[s][0] && heap[c][1] < heap[s][1]))) s = c; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  for (const k of starts) if (G.room[k]) { dist[k] = 0; push(0, k); }
  while (heap.length) {
    const [c, k] = pop();
    if (c > dist[k]) continue;
    const i = k % N, j = (k - i) / N;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const q = jj * N + ii, v = G.room[q];
      if (!v) continue;
      if (di && dj && (!G.room[j * N + ii] || !G.room[jj * N + i])) continue;   // (no cutting a corner)
      const step = (di && dj ? 1.4142 : 1) * (v === 2 ? 2 : 1), nc = c + step;
      if (nc < dist[q] - 1e-9) { dist[q] = nc; from[q] = k; push(nc, q); }
    }
  }
  return { dist, from };
}

// the way back from cell k to the start, in world tiles, its corners only
function wayTo(G, D, k) {
  const out = [];
  for (let q = k; q >= 0; q = D.from[q]) out.push([G.x0 + (q % G.N), G.y0 + Math.floor(q / G.N)]);
  out.reverse();
  return out.filter((p, i, a) => i === 0 || i === a.length - 1 || (p[0] - a[i - 1][0] !== a[i + 1][0] - p[0]) || (p[1] - a[i - 1][1] !== a[i + 1][1] - p[1]));
}
// the tiles along a way of corners (every tile it passes through)
export function routeTiles(route) {
  const out = [];
  for (let i = 0; i < route.length; i++) {
    const [x, y] = route[i];
    if (!i) { out.push([x, y]); continue; }
    const [px, py] = route[i - 1], n = Math.max(Math.abs(x - px), Math.abs(y - py));
    for (let k = 1; k <= n; k++) out.push([px + Math.round(((x - px) * k) / n), py + Math.round(((y - py) * k) / n)]);
  }
  return out;
}
// a way's length in tiles (diagonal steps count 1.41)
export function routeLen(route) { let L = 0; for (let i = 1; i < route.length; i++) L += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); return L; }

// One yard's pallets and bay, or null if it hasn't the room
function planYard(m, y, ctx) {
  const ox = Math.floor(y.x / TILE), oy = Math.floor(y.y / TILE), R = BAY.search, G = yardGrid(m, ox, oy, R, ctx);
  for (const k of ctx.taken) { const tx = k % 65536, ty = (k - tx) / 65536, i = tx - G.x0, j = ty - G.y0; if (i >= 0 && j >= 0 && i < G.N && j < G.N) G.g[j * G.N + i] = 0; }   // (another yard's pallets and bay)
  const half = 22, pickDeep = 44, slotsW = BAY.slots * BAY.slotW, bayDeep = BAY.slotD, N = G.N;
  // the pallets' rows that fit near the yard's forklift or door, nearest first
  const picks = [];
  for (let dj = -BAY.pickR; dj <= BAY.pickR; dj++) for (let di = -BAY.pickR; di <= BAY.pickR; di++) {
    const d2 = di * di + dj * dj;
    if (d2 > BAY.pickR * BAY.pickR) continue;
    for (const [fx, fy] of DIRS) {
      // (the row's middle on a tile's edge across it - two tiles deep, not three - and on a tile's middle along it)
      const cx = (ox + di + (fx ? 0 : 0.5)) * TILE, cy = (oy + dj + (fy ? 0 : 0.5)) * TILE;
      const ax = fy ? 1 : 0, ay = fx ? 1 : 0;
      const r = rowAt(G, cx, cy, ax, ay, fx, fy, BAY.pallets, BAY.rowGap, half, pickDeep, BAY.apron);
      if (!allOf(G, G.g, ...r.foot, ctx.street ? 2 : 1) || !allOf(G, G.room, ...r.ap, 2)) continue;
      picks.push({ d2, cx, cy, ax, ay, fx, fy, r });
    }
  }
  picks.sort((a, b) => a.d2 - b.d2);
  let best = null, tried = 0;
  const lo = BAY.route[0], hi = BAY.route[1];
  for (const P of picks) {
    if (tried >= 8 || (best && best.score < -6)) break;   // (a good one: backed on a wall at about the length wanted)
    if (picks.indexOf(P) > 0 && Math.abs(P.cx - picks[0].cx) + Math.abs(P.cy - picks[0].cy) < 3 * TILE && tried) continue;   // (one try for rows on top of each other)
    tried++;
    const starts = [];
    for (let j = P.r.ap[1]; j <= P.r.ap[3]; j++) for (let i = P.r.ap[0]; i <= P.r.ap[2]; i++) starts.push(j * N + i);
    const D = drive(G, starts);
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const dc = D.dist[j * N + i];
      if (!(dc >= lo - 6 && dc <= hi * 2 + 6)) continue;   // (the apron's next to this tile: about that far)
      const cx0 = (G.x0 + i + 0.5) * TILE, cy0 = (G.y0 + j + 0.5) * TILE;
      for (const [fx, fy] of DIRS) {
        // (this tile is the apron's middle: the bay behind it)
        const back = bayDeep / 2 + (BAY.apron * TILE) / 2 - TILE / 2;   // (the apron's middle tile's centre to the bay's middle: on a tile's edge across it)
        const cx = cx0 - fx * back, cy = cy0 - fy * back;
        if (Math.hypot(cx - P.cx, cy - P.cy) < 18 * TILE) continue;   // (across the yard, not beside the pallets)
        const ax = fy ? 1 : 0, ay = fx ? 1 : 0;
        const r = rowAt(G, cx, cy, ax, ay, fx, fy, BAY.slots, BAY.slotW, BAY.slotW / 2 + 28, bayDeep, BAY.apron);   // (28: room at each end for the sign and the floodlight)
        const mid = ((r.ap[1] + r.ap[3]) >> 1) * N + ((r.ap[0] + r.ap[2]) >> 1);
        const d = D.dist[mid];
        if (!(d >= lo && d <= hi * 2)) continue;
        if (!allOf(G, G.g, ...r.foot, ctx.street ? 2 : 1) || !allOf(G, G.room, ...r.ap, 2)) continue;
        // (a wall behind it - a warehouse's dock doors, the yard's own wall: it reads as a loading bay)
        let wall = 0;
        const bi = fx ? (fx > 0 ? r.foot[0] - 1 : r.foot[2] + 1) : -1, bj = fy ? (fy > 0 ? r.foot[1] - 1 : r.foot[3] + 1) : -1;
        if (fx) { for (let j2 = r.foot[1]; j2 <= r.foot[3]; j2++) if (bi >= 0 && bi < N && G.wall[j2 * N + bi]) wall++; }
        else for (let i2 = r.foot[0]; i2 <= r.foot[2]; i2++) if (bj >= 0 && bj < N && G.wall[bj * N + i2]) wall++;
        const along = fx ? r.foot[3] - r.foot[1] + 1 : r.foot[2] - r.foot[0] + 1, backed = wall >= along - 1;
        const pre = Math.abs(d - BAY.aim) - (backed ? 18 : wall * 2) + P.d2 / 40;
        if (best && pre >= best.score - 1e-9) continue;
        const way = wayTo(G, D, mid), len = routeLen(way);   // (the way in tiles: the street counts its length, not its cost)
        if (len < lo || len > hi) continue;
        const score = Math.abs(len - BAY.aim) - (backed ? 18 : wall * 2) + P.d2 / 40;
        if (!best || score < best.score - 1e-9) best = { score, P, way, len, cx, cy, ax, ay, fx, fy, r, backed };
      }
    }
  }
  if (!best) return null;
  const { P, cx, cy, ax, ay, fx, fy, r } = best;
  for (const F of [P.r.foot, P.r.ap, r.foot, r.ap]) for (let j = F[1]; j <= F[3]; j++) for (let i = F[0]; i <= F[2]; i++) ctx.taken.add((G.y0 + j) * 65536 + G.x0 + i);
  const endAt = (s) => ({ x: Math.round(cx + ax * s * (slotsW / 2 + 14) + fx * (bayDeep / 2 - 6)), y: Math.round(cy + ay * s * (slotsW / 2 + 14) + fy * (bayDeep / 2 - 6)) });   // (at the front corners: clear of a wall behind)
  return {
    yard: { x: Math.round(y.x), y: Math.round(y.y), name: y.name, ...(y.poi ? { poi: true } : null) },
    // (the forks face the pallets from the apron, and the bay's back from its apron: -f)
    pick: { x: P.cx, y: P.cy, ax: P.ax, ay: P.ay, fx: -P.fx, fy: -P.fy, pallets: rowItems(P.cx, P.cy, P.ax, P.ay, BAY.pallets, BAY.rowGap) },
    bay: { x: cx, y: cy, ax, ay, fx: -fx, fy: -fy, w: slotsW, d: bayDeep, back: best.backed, slots: rowItems(cx, cy, ax, ay, BAY.slots, BAY.slotW), sign: endAt(-1), lamps: [endAt(1)] },
    route: best.way, len: Math.round(best.len),
  };
}

// The pass (shared/map.js): m.loadBays, one for each yard that has the room
export function buildLoadingBays(m) {
  const sites = yardSites(m), near = nearOf(m, sites.map(boxOf)), ctx = { fences: fenceSegments(m), taken: new Set(), near: null };
  m.loadBays = [];
  // (the yard's paved ground; then its grass and dirt too; a warehouse's own door - its job always offered - at last the
  // street in front of it too)
  sites.forEach((y, k) => {
    ctx.near = near[k];
    let b = null;
    for (const [open, street] of [[false, false], [true, false], [true, true]]) { if (street && !y.poi) break; ctx.open = open; ctx.street = street; b = planYard(m, y, ctx); if (b) break; }
    if (b) m.loadBays.push(b);
  });
  return m.loadBays;
}
