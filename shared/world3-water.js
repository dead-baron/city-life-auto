// World v3 (docs/WORLD-V3.md 8.21): the places on the water - Prison Island (part 1.2: J1-J4), the Long Reach (part 1.7:
// the quays at Old Town and Willow Crossing, the weir and the lock at Willow Crossing, the banks' willows and reeds, the
// farm docks) and Kestrel Lake (part 1.5 R5: the lookout on Lookout Hill, the lakeside campground, the boathouse with
// its boat rental, the fishing docks, the island). Concepts J1, J4, W1, NK1-E, NK1-N. For the whole-world build only
// (shared/world3-world.js calls these, one call each; the page and the city worker never import this module):
// - paintWater3(L, W, H): Kestrel Lake's island on the land layer (the lake's water made land: Willow Valley's).
// - buildWater3(m, addProp) (from the dress hook, before the biomes' dressing - what it builds is kept from it, reserve
//   4): the prison (its walls, the four guard towers, the three cell blocks round the exercise yard with its sports
//   court, the kitchen block, the gatehouse and the gate that opens for officers only - shared/map.js m.gates, as the
//   Syndicate compound's - the warden's house, the lighthouse); the weir and the lock at Willow Crossing; the farm
//   docks and the banks' willows and reeds along the Long Reach; Kestrel Lake's lookout, campground, fishing docks, the
//   boathouse and its pier, the island's trees.
// - waterDone(m, H3) (from the done hook, after the ferries' piers - shared/world3-ferries.js): the boat rental at the
//   boathouse (today's rental kind: m.rentals), the stone quays at the River Water Bus's Old Town and Willow Crossing
//   stops (bollards, lamps, a cafe), the prison's harbour round the Prison Boat's island stop (a stone pier, the
//   harbour office, the path up to the gate); the summary (m.world3.water) and m.prison (the guards' posts, the
//   compound - listed, not wired: no server system spawns prison guards yet).
import { TILE, T } from './constants.js';
import { WATER3, TERRAIN3 } from './world3-land.js';

const D = { valley: 49, prison: 55 };   // (shared/mapcore.js DISTRICTS: Willow Valley, Prison Island)
// Prison Island (tiles; v3b, docs/WORLD-V3.md part 9: the owner's island far out in the south-east, world3-layout.js
// ISLANDS3 'prison'): the walled compound round the exercise yard on the island's middle, its gate in the south wall,
// the warden's house east of it, the light on the east point
export const PRISON = {
  name: 'Kestrel Bay Penitentiary', island: 'Prison Island',
  box: [5695, 3572, 5795, 3648], gate: [5741, 5745],   // the gate: these columns of the south wall
  warden: [5814, 3594, 12, 9], light: [5876, 3612, 6, 6],
};
// the Long Reach (tiles; v3b: the farm valley lake's outlet below Willow Crossing, out to the sea's inlet): the weir
// and the lock (on the river between these two of its points - a downstream, b upstream - at this row; the town's
// bank north-east of it), the farm docks on its south-west bank (a point in the river and the way to the bank)
export const REACH = {
  lock: { a: [3736, 1300], b: [3646, 1230], y: 1265 },
  docks: [['Hollins Farm Dock', [3755, 1308], -1], ['Brightwater Farm Dock', [3700, 1272], -1], ['Mill Farm Dock', [3620, 1205], -1]],
};
// Kestrel Lake (tiles; v3b: the farm valley's lake, world3-layout.js LAKES3[0], with the island the owner's concept
// draws in it; the lookout on the hill over its north-east shore, the campground on its west shore by Lakeshore Road,
// the boathouse on its south shore by Lake Road - world3-towns.js TOWN_ROADS3)
export const KESTREL = {
  island: { at: [3390, 1050], rx: 28, ry: 19 },
  lookout: [3430, 860], camp: [3200, 930, 3236, 968], boathouse: [3350, 1192], rentName: 'Kestrel Lake Boat Hire',
  belt: [3100, 700, 3660, 1230],   // (the lake's green belt: the box it's looked for in; its outlet, the Long Reach, below it)
  fishing: [['East Shore Fishing Dock', [3626, 1080], [-1, 0]], ['North Shore Fishing Dock', [3450, 950], [0, 1]], ['Reed Bay Fishing Dock', [3250, 1192], [0, -1]]],
  roads: { lookout: [3722, 860], lake: 1250, camp: [3170, 950] },   // (where the tracks out meet the roads: Willow Road, Lake Road's row, Lakeshore Road)
};
// the pictures' views (tools/world3-world-map.mjs --towns: docs/world-v3-town-<key>.png)
export const WATER_VIEWS = [
  { key: 'prison', name: 'Prison Island', box: [5560, 3500, 5930, 3760] },
  { key: 'lock', name: 'Willow Crossing: the weir, the lock and the quay', box: [3580, 1150, 3820, 1340] },
  { key: 'kestrel', name: 'Kestrel Lake: the lookout, the campground, the boathouse, the island', box: [3100, 700, 3660, 1260] },
  { key: 'oldquay', name: "Old Town's quay", box: [2380, 2040, 2520, 2180] },   // (round the River Water Bus's Old Town stop: shared/world3-ferries.js)
];

const GROUND = new Set([T.GRASS, T.DIRT, T.SAND]);
const inEll = (x, y, c) => { const dx = (x + 0.5 - c.at[0]) / c.rx, dy = (y + 0.5 - c.at[1]) / c.ry; return dx * dx + dy * dy <= 1; };

// Kestrel Lake's island: the lake's water inside the ellipse made Willow Valley's land (its zone the nearest land's)
export function paintWater3(L, W, H) {
  const c = KESTREL.island;
  let zone = 0, n = 0;
  for (let x = c.at[0] - c.rx; x > c.at[0] - 4 * c.rx && !zone; x--) { const i = c.at[1] * W + x; if (L.land[i]) zone = L.zone[i]; }
  for (let y = c.at[1] - c.ry; y <= c.at[1] + c.ry; y++) for (let x = c.at[0] - c.rx; x <= c.at[0] + c.rx; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H || !inEll(x, y, c)) continue;
    const i = y * W + x;
    if (L.water[i] !== WATER3.LAKE) continue;
    L.land[i] = 1; L.water[i] = WATER3.LAND; L.dist[i] = D.valley; L.zone[i] = zone; L.terrain[i] = TERRAIN3.FOREST; n++;
  }
  return { island: n };
}

// the helpers on the built map
function kit(m, addProp, out) {
  const W = m.w, HH = m.h;
  const inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const wet = (x, y) => inF(x, y) && !m.land[y * W + x] && (m.tiles[y * W + x] === T.WATER || m.tiles[y * W + x] === T.DEEP);
  const open = (x, y) => inF(x, y) && m.land[y * W + x] && GROUND.has(m.tiles[y * W + x]) && m.bld[y * W + x] < 0;
  const keep = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y < Math.min(HH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) m.reserve[y * W + x] |= 4; };
  const prop = (t, tx, ty, r, extra) => { addProp(m, t, tx * TILE, ty * TILE, r || 0, extra); out.props++; return true; };
  // ground made: on open ground (or the water: made land, the district given, its zone the nearest land's)
  const ground = (x, y, t, d) => {
    if (!inF(x, y)) return false;
    const i = y * W + x;
    if (m.bld[i] >= 0) return false;
    if (wet(x, y)) { m.land[i] = 1; m.river[i] = 0; if (m.lake) m.lake[i] = 0; m.dist[i] = d; m.tiles[i] = t; m.reserve[i] |= 4; out.made++; return true; }
    if (!open(x, y) && m.tiles[i] !== T.PLAZA && m.tiles[i] !== T.LOT) return false;
    m.tiles[i] = t; m.reserve[i] |= 4; return true;
  };
  const dock = (x, y) => { if (!wet(x, y)) return false; m.tiles[y * W + x] = T.DOCK; m.reserve[y * W + x] |= 4; return true; };
  const addBld = (x, y, w, h, kind, name, roofKind, art) => {
    const bid = m.buildings.length;
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { if (!inF(tx, ty)) return null; const i = ty * W + tx; if (!m.land[i] || !(GROUND.has(m.tiles[i]) || m.tiles[i] === T.PLAZA) || m.bld[i] >= 0) return null; }
    m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: roofKind, seed: (Math.imul(x, 7919) ^ Math.imul(y, 104729)) >>> 0, d: m.dist[(y + (h >> 1)) * W + x + (w >> 1)], b: bid });
    const b = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind, name, business: null, signs: [], art: { noShop: true, ...art } };
    m.buildings.push(b);
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * W + tx] = bid; m.reserve[ty * W + tx] |= 4; }
    out.buildings.push(name);
    return b;
  };
  // a trail or a path along a polyline (tiles), hw tiles each side, over open ground only
  const track = (pts, t, hw = 1.2) => {
    let n = 0;
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], L = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= L; k++) {
        const cx = ax + (bx - ax) * k / L, cy = ay + (by - ay) * k / L, R = Math.ceil(hw);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > hw * hw) continue;
          const x = Math.floor(cx + dx), y = Math.floor(cy + dy);
          if (!open(x, y)) continue;
          m.tiles[y * W + x] = t; m.reserve[y * W + x] |= 4; n++;
        }
      }
    }
    out.trail += n;
    return n;
  };
  const landmark = (name, type, x0, y0, x1, y1) => (m.landmarks ||= []).push({ name, type, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
  // from a point, step along (dx, dy) to the first tile of the other kind (land -> water or water -> land): the last tile
  // of the first kind
  const edge = (x, y, dx, dy, max = 120) => {
    const w0 = wet(x, y);
    for (let k = 0; k < max; k++) { const nx = Math.round(x + dx * (k + 1)), ny = Math.round(y + dy * (k + 1)); if (wet(nx, ny) !== w0) return [Math.round(x + dx * k), Math.round(y + dy * k)]; }
    return null;
  };
  // a jetty out from a bank tile (bx, by) along (dx, dy) over the water: w across, len out; returns its end (tiles)
  const jetty = (bx, by, dx, dy, len, w) => {
    const px = -dy, py = dx, h = (w - 1) / 2;
    let end = null;
    for (let k = 1; k <= len; k++) for (let o = -h; o <= h; o++) { const x = Math.round(bx + dx * k + px * o), y = Math.round(by + dy * k + py * o); if (dock(x, y) && o === 0) end = [x, y]; }
    for (let o = -h; o <= h; o++) { const x = Math.round(bx + px * o), y = Math.round(by + py * o); if (open(x, y)) { m.tiles[y * W + x] = T.DOCK; m.reserve[y * W + x] |= 4; } }
    return end;
  };
  return { W, HH, inF, wet, open, keep, prop, ground, dock, addBld, track, landmark, edge, jetty };
}

export function buildWater3(m, addProp) {
  const out = { props: 0, made: 0, trail: 0, buildings: [], prison: null, lock: null, docks: [], banks: { reeds: 0, willows: 0 }, lake: {} };
  const K = kit(m, addProp, out);
  buildPrison(m, K, out);
  buildLock(m, K, out);
  buildReach(m, K, out);
  buildLake(m, K, out);
  return out;
}

// ---- Prison Island ----------------------------------------------------------------------------------------------------
const STONE = { floors: 3, style: 'stone', wallColor: '#9a9488', pitch: 'flat', roof: 'tar', roofColor: '#5a5650' };
function buildPrison(m, K, out) {
  const W = m.w, [x0, y0, x1, y1] = PRISON.box, [g0, g1] = PRISON.gate;
  const P = { towers: [], blocks: [], walls: 0, gate: -1, guards: [], yard: null, court: null };
  K.keep(x0 - 12, y0 - 12, x1 + 12, y1 + 18);
  // the ground inside: concrete (the yard, the walks between the blocks)
  for (let y = y0 + 2; y < y1 - 2; y++) for (let x = x0 + 2; x < x1 - 2; x++) K.ground(x, y, T.PLAZA, D.prison);
  // the four guard towers on the corners (built before the walls: the walls run into them)
  for (const [cx, cy] of [[x0, y0], [x1 - 1, y0], [x0, y1 - 1], [x1 - 1, y1 - 1]]) {
    const b = K.addBld(cx - 3, cy - 3, 7, 7, 'tower', 'Guard Tower', 'metal', { spec: { floors: 4, style: 'stone', wallColor: '#8e877a', pitch: 'hip', roof: 'metal', roofColor: '#4a4a4a', slope: 0.5 } });
    if (b) { P.towers.push(b.id); P.guards.push({ x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, tower: true }); K.prop('lamp', cx + 0.5, cy + (cy === y0 ? -4 : 4.5), 0); }
  }
  // the walls: two tiles thick, the gate's columns in the south wall left open
  for (let x = x0; x < x1; x++) for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) { if (y >= y1 - 2 && x >= g0 && x < g1) continue; if (m.bld[y * W + x] < 0) { m.set(x, y, T.WALL); m.reserve[y * W + x] |= 4; P.walls++; } }
  for (let y = y0; y < y1; y++) for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) if (m.bld[y * W + x] < 0) { m.set(x, y, T.WALL); m.reserve[y * W + x] |= 4; P.walls++; }
  for (let y = y1 - 2; y < y1; y++) for (let x = g0; x < g1; x++) m.set(x, y, T.PLAZA);
  // the cell blocks round the exercise yard (J1: the big one north, two along the sides), the kitchen block, the gatehouse
  const blocks = [
    [x0 + 16, y0 + 6, x1 - x0 - 32, 14, 'Cell Block A', 4],
    [x0 + 6, y0 + 28, 14, 38, 'Cell Block B', 3],
    [x1 - 20, y0 + 28, 14, 38, 'Cell Block C', 3],
  ];
  for (const [bx, by, bw, bh, name, floors] of blocks) { const b = K.addBld(bx, by, bw, bh, 'prison', name, 'tar', { spec: { ...STONE, floors } }); if (b) P.blocks.push(b.id); }
  const kitchen = K.addBld(g1 + 6, y1 - 15, 20, 11, 'prison', 'Kitchen Block', 'metal', { spec: { ...STONE, floors: 2, roof: 'metal', roofColor: '#6a6a66' } });
  const gh = K.addBld(g0 - 14, y1 - 12, 12, 8, 'prison', 'Prison Gatehouse', 'tar', { spec: { ...STONE, floors: 2 } });
  P.kitchen = kitchen ? kitchen.id : -1; P.gatehouse = gh ? gh.id : -1;
  // the exercise yard between the blocks: the sports court in its middle (a basketball court, hoops at its ends),
  // benches and bleachers along it, the chain-link fence round it, floodlights at its corners
  const yx0 = x0 + 22, yx1 = x1 - 22, yy0 = y0 + 24, yy1 = y1 - 18, ymx = (yx0 + yx1) / 2;
  P.yard = [yx0, yy0, yx1, yy1];
  const cw = 26, cd = 14, cy = yy0 + 5;
  K.prop('court', ymx, cy, 0, { w: cw * TILE, d: cd * TILE, c1: '#7a6a5a', c2: '#e8e0d0' });
  for (const s of [-1, 1]) K.prop('hoop', ymx + s * (cw / 2 - 1.2), cy + cd / 2, 0);
  P.court = [ymx - cw / 2, cy, ymx + cw / 2, cy + cd];
  K.prop('bleachers', ymx, yy0 + 2, 0, { len: 16 * TILE, rows: 3 });
  for (let k = 0; k < 4; k++) K.prop('bench_m', yx0 + 6 + k * 9, yy1 - 3, 0);
  for (const [ax, ay, bx, by] of [[yx0, yy0, yx1, yy0], [yx1, yy0, yx1, yy1], [yx1, yy1, yx0, yy1], [yx0, yy1, yx0, yy0]]) K.prop('chainfence', ax, ay, 0, { tx: (bx - ax) * TILE, ty: (by - ay) * TILE });
  for (const [x, y] of [[yx0 + 1, yy0 + 1], [yx1 - 1, yy0 + 1], [yx0 + 1, yy1 - 1], [yx1 - 1, yy1 - 1]]) K.prop('lamp', x, y, 0);
  // the guards' posts: the towers (above), the gate, the yard's corners, the blocks' doors
  for (const [x, y] of [[g0 - 1, y1 + 1], [g1 + 1, y1 + 1], [g0 + 2, y1 - 4], [yx0 + 2, yy0 + 2], [yx1 - 2, yy1 - 2], [ymx, yy1 - 1], [x0 + 21, y0 + 46], [x1 - 21, y0 + 46]]) P.guards.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
  // the gate: officers only (shared/map.js m.gates' rule 'police': server/systems/gates.js opens it for a badge, lets
  // anyone inside back out)
  const gate = { x: ((g0 + g1) / 2) * TILE, y: (y1 - 1) * TILE, w: (g1 - g0) * TILE, vertical: false, props: [], rule: 'police', rect: { tx: x0, ty: y0, tw: x1 - x0, th: y1 - y0 } };
  for (let px = g0 * TILE + 8; px <= g1 * TILE - 8; px += 14) gate.props.push(m.addSolidProp(px, gate.y, 10));
  (m.gates ||= []).push(gate);
  P.gate = m.gates.length - 1;
  K.landmark(PRISON.name, 'prison', x0, y0, x1, y1);
  // outside the walls: the warden's house in its garden east of the compound, a path to the gate; the lighthouse on the
  // island's east point
  const [wx, wy, ww, wh] = PRISON.warden;
  const wd = K.addBld(wx, wy, ww, wh, 'house', "Warden's House", 'shingle', { spec: { floors: 2, style: 'clapboard', wallColor: '#e8e2d4', pitch: 'gable', roof: 'shingle', roofColor: '#4a5a6a', slope: 0.6 } });
  P.warden = wd ? wd.id : -1;
  if (wd) { for (let k = 0; k < 5; k++) K.prop('shrub_a', wx - 1 + k * 3, wy + wh + 2, 0, { sp: 'hydrangea', k: 1 }); K.track([[wx + ww / 2, wy + wh + 1], [wx + ww / 2, y1 + 6], [g1 + 1, y1 + 6], [g1 - 1, y1]], T.PLAZA, 1.3); }
  const [lx, ly, lw, lh] = PRISON.light;
  const lt = K.addBld(lx, ly, lw, lh, 'lighthouse', 'Prison Island Light', 'metal', {});
  P.light = lt ? lt.id : -1;
  m.prison = { name: PRISON.name, x: ((x0 + x1) / 2) * TILE, y: ((y0 + y1) / 2) * TILE, compound: { tx: x0, ty: y0, tw: x1 - x0, th: y1 - y0 }, gate: P.gate, guards: P.guards, yard: P.yard };
  out.prison = P;
}

// ---- the Long Reach: the weir and the lock at Willow Crossing ----------------------------------------------------------
function buildLock(m, K, out) {
  const W = m.w, { a, b, y } = REACH.lock;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len;   // (upstream)
  const nx = -ty, ny = tx;   // (across: east, the town's bank, is +v)
  const s = (y - a[1]) / ty, cx = a[0] + tx * s, cy = y;
  // the water's run across the river here
  let vmin = null, vmax = null;
  for (let v = -80; v <= 80; v += 0.5) { const x = Math.floor(cx + nx * v), yy = Math.floor(cy + ny * v); if (K.wet(x, yy)) { if (vmin === null) vmin = v; vmax = v; } else if (vmin !== null && v > 0) break; }
  if (vmin === null) return;
  const C = { channel: 10, wall: 3, quay: 4, half: 22 };
  const e = vmax, ch0 = e - 2 - C.channel, wl0 = ch0 - C.wall;
  let weir = 0, walls = 0;
  for (let yy = Math.floor(cy - 40); yy <= cy + 40; yy++) for (let x = Math.floor(cx - 50); x <= cx + 50; x++) {
    const u = (x + 0.5 - cx) * tx + (yy + 0.5 - cy) * ty, v = (x + 0.5 - cx) * nx + (yy + 0.5 - cy) * ny;
    if (Math.abs(u) <= C.half + 2 && v >= e - 2 && v < e + C.quay) { if (K.ground(x, yy, T.PLAZA, D.valley)) walls++; continue; }   // (the lock's east side: the stone quay)
    if (Math.abs(u) <= C.half + 2 && v >= wl0 && v < ch0) { if (K.ground(x, yy, T.PLAZA, D.valley)) walls++; continue; }          // (the wall between the lock and the weir)
    if (Math.abs(u) <= 1.5 && v >= vmin - 2 && v < wl0 && K.wet(x, yy)) { K.ground(x, yy, T.WALL, D.valley); weir++; }            // (the weir's crest)
  }
  const at = (u, v) => [cx + tx * u + nx * v, cy + ty * u + ny * v];
  // the white water below the weir (downstream: -u), the lock's gates at both ends (their posts and the beams across,
  // drawn open: the boats pass), bollards and lamps along the quay, the lock keeper's house on the bank
  for (let v = vmin + 3; v < wl0 - 1; v += 5) { const [x, yy] = at(-3, v); K.prop('fallsmall', x, yy, 0, { w: 150, h: 16 }); }
  for (const u of [-C.half, C.half]) for (const v of [ch0 - 0.5, e - 1.5]) { const [x, yy] = at(u, v); K.prop('post', x, yy, 5, { h: 40 }); }
  for (let u = -C.half + 2; u <= C.half - 2; u += 5) { const [x, yy] = at(u, e - 1.3); K.prop('bollard', x, yy, 0); }
  for (const u of [-C.half, 0, C.half]) { const [x, yy] = at(u, wl0 + 1.5); K.prop('lamp', x, yy, 0); }
  let keeper = null;
  for (let k = 0; k < 12 && !keeper; k++) { const [x, yy] = at(-6 + k * 3, e + C.quay + 2); keeper = K.addBld(Math.floor(x), Math.floor(yy), 6, 5, 'house', "Lock Keeper's House", 'slate', { spec: { floors: 2, style: 'stone', wallColor: '#b8ac98', pitch: 'gable', roof: 'slate', roofColor: '#4a4e58', slope: 0.6 } }); }
  const [lx, ly] = at(0, (vmin + e) / 2);
  K.landmark('Willow Crossing Lock and Weir', 'lock', lx - 40, ly - 30, lx + 40, ly + 30);
  m.locks = [{ name: 'Willow Crossing Lock', x: Math.round(cx * TILE), y: Math.round(cy * TILE), a: Math.atan2(ty, tx), channel: [ch0, e - 2], half: C.half, open: true }];
  out.lock = { center: [Math.round(cx), cy], tangent: [tx, ty], vmin, vmax, channel: [ch0, e - 2], weir, walls, keeper: keeper ? keeper.id : -1 };
}

// ---- the Long Reach: the banks' willows and reeds, the farm docks ------------------------------------------------------
const RIVER_PTS = [[3770, 1316], [3736, 1300], [3646, 1230], [3592, 1178]];   // (v3b: the lake's outlet, from the sea's inlet up)
function buildReach(m, K, out) {
  const W = m.w;
  let step = 0;
  for (let j = 1; j < RIVER_PTS.length; j++) {
    const [ax, ay] = RIVER_PTS[j - 1], [bx, by] = RIVER_PTS[j], len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len, nx = -ty, ny = tx;
    for (let s = 0; s < len; s += 9, step++) {
      const cx = ax + tx * s, cy = ay + ty * s;
      if (cy > 1400) continue;   // (the mouth: the sea's inlet)
      for (const side of [-1, 1]) {
        // the bank: out from the water's middle to the first land
        let bank = null;
        for (let v = 0; v <= 70; v++) { const x = Math.floor(cx + nx * v * side), y = Math.floor(cy + ny * v * side); if (!K.wet(x, y)) { if (v > 2) bank = [x, y]; break; } }
        if (!bank || !K.open(bank[0], bank[1]) || m.reserve[bank[1] * W + bank[0]]) continue;
        const h = (Math.imul(step * 2 + (side > 0 ? 1 : 0), 2654435761) >>> 0) / 4294967296;
        K.prop('shrub_a', bank[0] + 0.5, bank[1] + 0.5, 0, { sp: h < 0.35 ? 'cattails' : 'reeds', k: 1 }); out.banks.reeds++;
        m.reserve[bank[1] * W + bank[0]] |= 4;
        if (step % 3 === (side > 0 ? 1 : 0)) {
          const wx = Math.floor(bank[0] + nx * side * 4), wy = Math.floor(bank[1] + ny * side * 4);
          if (K.open(wx, wy) && !m.reserve[wy * W + wx]) { K.prop('tree_a', wx + 0.5, wy + 0.5, 12, { sp: 'willow', k: 1.45 }); m.reserve[wy * W + wx] |= 4; out.banks.willows++; }
        }
      }
    }
  }
  // the farm docks: a wooden jetty out from the farmland's (west) bank, a canoe tied up, crates; a track back
  for (const [name, [px, py], side] of REACH.docks) {
    let best = null;
    for (let j = 1; j < RIVER_PTS.length && !best; j++) {
      const [ax, ay] = RIVER_PTS[j - 1], [bx, by] = RIVER_PTS[j];
      if (py > Math.max(ay, by) + 1 || py < Math.min(ay, by) - 1) continue;
      const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len;
      best = { nx: -ty * side, ny: tx * side };
    }
    if (!best) continue;
    const e = K.edge(px, py, best.nx, best.ny, 80);   // (the last water tile toward the bank)
    if (!e) continue;
    const bx = Math.round(e[0] + best.nx), by = Math.round(e[1] + best.ny);
    if (!K.open(bx, by)) continue;
    const ox = Math.abs(best.nx) > Math.abs(best.ny) ? -Math.sign(best.nx) : 0, oy = ox ? 0 : -Math.sign(best.ny);
    const end = K.jetty(bx, by, ox, oy, 8, 3);
    if (!end) continue;
    K.prop('canoe', end[0] + 0.5 - oy * 2, end[1] + 0.5 + ox * 2, 0, { a: Math.atan2(oy, ox) });
    K.prop('post', end[0] + 0.5 + oy * 1.6, end[1] + 0.5 - ox * 1.6, 5);
    K.prop('crates', bx + 0.5 - ox * 3 + oy * 2, by + 0.5 - oy * 3 + ox * 2, 12);
    K.track([[bx - ox * 2, by - oy * 2], [bx - ox * 26, by - oy * 26]], T.DIRT, 1.2);
    K.landmark(name, 'dock', Math.min(bx, end[0]) - 2, Math.min(by, end[1]) - 2, Math.max(bx, end[0]) + 3, Math.max(by, end[1]) + 3);
    out.docks.push({ name, at: [bx, by], end });
  }
}

// ---- Kestrel Lake ------------------------------------------------------------------------------------------------------
function buildLake(m, K, out) {
  const W = m.w, L = out.lake;
  // the lookout on Lookout Hill: a viewing platform of boards with rails, coin binoculars facing the lake, a bench and
  // a map board; a trail down to the north shore's fishing dock and east to Kestrel Road
  const [hx, hy] = KESTREL.lookout;
  let deck = 0;
  for (let y = hy - 3; y <= hy + 3; y++) for (let x = hx - 5; x <= hx + 5; x++) if (K.open(x, y)) { m.tiles[y * W + x] = T.DOCK; m.reserve[y * W + x] |= 4; deck++; }
  K.keep(hx - 8, hy - 6, hx + 9, hy + 7);
  if (deck > 40) {
    for (const dx of [-3, 0, 3]) K.prop('scope', hx + 0.5 + dx, hy + 3.4, 6);
    K.prop('bench_m', hx + 0.5, hy - 2, 0); K.prop('mapboard', hx - 4, hy - 2.5, 0); K.prop('lamp', hx + 5, hy - 3, 0);
    K.prop('pierrail', hx + 0.5, hy + 3.9, 0, { len: 11 * TILE, a: 0 });
    K.landmark('Lookout Hill', 'lookout', hx - 6, hy - 5, hx + 7, hy + 5);
    L.lookout = { deck, at: [hx, hy] };
    K.track([[hx + 6, hy], [hx + 130, hy], [KESTREL.roads.lookout[0], KESTREL.roads.lookout[1]]], T.DIRT, 1.1);   // (east to Willow Road)
    K.track([[hx, hy + 4], [hx + 10, hy + 60], [KESTREL.fishing[1][1][0], KESTREL.fishing[1][1][1] - 4]], T.DIRT, 1.1);   // (down to the north shore's dock)
  }
  // the island: its trees round a clearing with a picnic table and a landing on its east side
  const c = KESTREL.island;
  let isl = 0;
  for (let y = c.at[1] - c.ry; y <= c.at[1] + c.ry; y++) for (let x = c.at[0] - c.rx; x <= c.at[0] + c.rx; x++) {
    if (!K.inF(x, y) || !m.land[y * W + x] || m.dist[y * W + x] !== D.valley || !inEll(x, y, c)) continue;
    isl++; m.reserve[y * W + x] |= 4;
    const r = Math.hypot((x - c.at[0]) / c.rx, (y - c.at[1]) / c.ry), h = (Math.imul(x * 73 + y, 2654435761) >>> 0) / 4294967296;
    if (r > 0.45 && r < 0.92 && h < 0.07 && K.open(x, y)) K.prop('tree_a', x + 0.5, y + 0.5, 12, { sp: h < 0.03 ? 'willow' : h < 0.05 ? 'birch' : 'oak', k: 1.35 });
    else if (r >= 0.92 && h < 0.12 && K.open(x, y)) K.prop('shrub_a', x + 0.5, y + 0.5, 0, { sp: 'reeds', k: 1 });
  }
  if (isl) {
    K.prop('picnic', c.at[0] + 0.5, c.at[1] + 0.5, 0); K.prop('campfire', c.at[0] + 4.5, c.at[1] + 2.5, 0);
    const e = K.edge(c.at[0], c.at[1], 1, 0, 60);
    if (e) { const end = K.jetty(e[0], e[1], 1, 0, 5, 3); if (end) K.prop('post', end[0] + 0.5, end[1] - 1, 5); }
    K.landmark('Kestrel Island', 'island', c.at[0] - c.rx, c.at[1] - c.ry, c.at[0] + c.rx, c.at[1] + c.ry);
  }
  L.island = isl;
  // the lakeside campground on the west shore: tents round a fire, picnic tables, string lights; a track to Lake Road
  const [qx0, qy0, qx1, qy1] = KESTREL.camp;
  let pitches = 0;
  for (let y = qy0; y < qy1; y++) for (let x = qx0; x < qx1; x++) if (K.open(x, y)) { m.tiles[y * W + x] = T.DIRT; m.reserve[y * W + x] |= 4; }
  for (const [dx, dy, r] of [[5, 5, 1], [13, 4, 2], [24, 6, 1], [6, 26, 3], [16, 29, 2], [28, 24, 0]]) { const x = qx0 + dx, y = qy0 + dy; if (K.open(x, y)) { K.prop('tent', x + 0.5, y + 0.5, 12, { v: r }); pitches++; } }
  const fx = (qx0 + qx1) / 2, fy = (qy0 + qy1) / 2;
  K.prop('campfire', fx, fy, 0); K.prop('picnic', fx + 5, fy - 3, 0); K.prop('picnic', fx - 6, fy + 4, 0); K.prop('cooler', fx + 2, fy + 3, 0);
  K.prop('festoon', fx - 8, fy - 6, 0, { tx: 16 * TILE, ty: 0, h: 90 }); K.prop('woodpile', qx0 + 2, fy, 0); K.prop('lantern', fx + 3, fy - 1, 4);
  K.track([[qx0 - 1, fy], KESTREL.roads.camp], T.DIRT, 1.3);
  K.landmark('Kestrel Lake Campground', 'camp', qx0, qy0, qx1, qy1);
  L.camp = pitches;
  // the fishing docks: a short jetty, rod holders, a fish table, a life ring
  L.fishing = [];
  for (const [name, [px, py], [dx, dy]] of KESTREL.fishing) {
    const e = K.edge(px, py, dx, dy, 160);
    if (!e || !K.open(e[0], e[1])) continue;
    const end = K.jetty(e[0], e[1], dx, dy, 7, 3);
    if (!end) continue;
    K.prop('rods', end[0] + 0.5 - dy, end[1] + 0.5 + dx, 0, { a: Math.atan2(dy, dx) }); K.prop('fishtable', e[0] + 0.5 - dy * 2, e[1] + 0.5 - dx * 2, 0);
    K.prop('lifering', end[0] + 0.5 + dy, end[1] + 0.5 - dx, 0, { a: Math.atan2(dy, dx) }); K.prop('bench_m', e[0] + 0.5 - dx * 2 + dy * 2, e[1] + 0.5 - dy * 2 + dx * 2, 0);
    K.landmark(name, 'dock', Math.min(e[0], end[0]) - 2, Math.min(e[1], end[1]) - 2, Math.max(e[0], end[0]) + 3, Math.max(e[1], end[1]) + 3);
    L.fishing.push({ name, at: e, end });
  }
  // a green belt round the lake (the biomes' fields and orchards stop short of the water): the shore's six tiles kept
  // from their dressing, reeds and cattails at the water's edge, willows a few tiles back
  {
    const [bx0, by0, bx1, by1] = KESTREL.belt, BW = bx1 - bx0, BH = by1 - by0, dd = new Int8Array(BW * BH).fill(-1), q = [];
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (K.wet(x, y)) { dd[(y - by0) * BW + x - bx0] = 0; q.push(x, y); }
    for (let h = 0; h < q.length; h += 2) {
      const x = q[h], y = q[h + 1], d = dd[(y - by0) * BW + x - bx0];
      if (d >= 6) continue;
      for (const [ax, ay] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (ax < bx0 || ay < by0 || ax >= bx1 || ay >= by1) continue; const j = (ay - by0) * BW + ax - bx0; if (dd[j] >= 0) continue; dd[j] = d + 1; q.push(ax, ay); }
    }
    let reeds = 0, willows = 0, belt = 0;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const d = dd[(y - by0) * BW + x - bx0], i = y * W + x;
      if (d < 1 || !m.land[i] || m.reserve[i] & 4) continue;
      m.reserve[i] |= 4; belt++;
      if (!K.open(x, y)) continue;
      const h = (Math.imul(x * 131 + y * 7, 2654435761) >>> 0) / 4294967296;
      if (d === 1 && h < 0.4) { K.prop('shrub_a', x + 0.5, y + 0.5, 0, { sp: h < 0.14 ? 'cattails' : 'reeds', k: 1 }); reeds++; }
      else if (d === 4 && h < 0.07) { K.prop('tree_a', x + 0.5, y + 0.5, 12, { sp: 'willow', k: 1.45 }); willows++; }
    }
    L.belt = { tiles: belt, reeds, willows };
  }
  // the boathouse on the south shore: the building ashore, its pier out into the lake (the rental's boats along it: the
  // rental itself is registered in waterDone, after buildBoatDocks has made m.rentals), the boathouse's slip, a track
  // to Lake Road
  const [bx0, by0] = KESTREL.boathouse;
  const e = K.edge(bx0, by0, 0, -1, 140);
  if (e) {
    const [sx, sy] = e;
    let bh = null;
    for (let k = 0; k < 10 && !bh; k++) bh = K.addBld(sx - 15 + (k % 5) * 2, sy + 3 + (k >> 1), 11, 7, 'charter', 'Kestrel Lake Boathouse', 'shingle', { spec: { floors: 1, style: 'siding', wallColor: '#7a5636', pitch: 'gable', roof: 'shingle', roofColor: '#3e4a3a', slope: 0.6 } });
    const end = K.jetty(sx, sy, 0, -1, 10, 3);
    if (end) {
      K.prop('boathouse', sx + 4.5, sy - 3, 0); K.prop('lamp', end[0] + 0.5, end[1], 0);
      for (let k = 0; k < 3; k++) K.prop('canoe', sx - 2.2, sy - 3 - k * 2.4, 0, { a: -Math.PI / 2, c: k });
      K.track([[sx, sy + 2], [sx, sy + 12], [sx, KESTREL.roads.lake]], T.DIRT, 1.3);
      L.boathouse = { building: bh ? bh.id : -1, shore: [sx, sy], end };
      K.landmark('Kestrel Lake Boathouse', 'marina', sx - 16, sy - 12, sx + 8, sy + 12);
    }
  }
}

// ---- after the ferries' piers: the rental, the quays, the prison's harbour ----------------------------------------------
export function waterDone(m, H3) {
  const W = m.w, out = m.world3.water || {};
  const K = kit(m, (mm, t, x, y, r, ex) => { const p = { t, x: Math.round(x), y: Math.round(y), ...ex }; mm.props.push(p); if (t === 'lamp') mm.lamps.push(p); }, { props: 0, made: 0, trail: 0, buildings: [] });
  const gone = new Set();
  const clearTiles = () => { if (gone.size && H3 && H3.removeProps) H3.removeProps(m, (x, y) => gone.has(Math.floor(y / TILE) * W + Math.floor(x / TILE))); gone.clear(); };
  // the boat rental at the boathouse (today's rental kind: server/systems/rentals.js hires its boats from m.rentals)
  const B = out.lake && out.lake.boathouse;
  if (B && m.rentals) {
    const [sx, sy] = B.shore;
    const door = { x: (sx + 0.5) * TILE, y: (sy + 1.2) * TILE };
    const poi = { id: m.pois.length, kind: 'rental', label: KESTREL.rentName, x: door.x, y: door.y, r: 48, ...(B.building >= 0 ? { b: B.building } : {}) };
    m.pois.push(poi);
    const spots = [];
    for (let k = 3; k <= 9; k += 2.5) for (const sd of [-1, 1]) spots.push({ x: (sx + 0.5 + sd * 2.5) * TILE, y: (sy + 0.5 - k) * TILE, a: -Math.PI / 2 });
    m.rentals.push({ poi: poi.id, name: KESTREL.rentName, spots, lake: true, dock: door });
    out.rental = { poi: poi.id, spots: spots.length };
  }
  // the quays: at the River Water Bus's Old Town and Willow Crossing stops, stone along the shore either side of the
  // pontoon (not over it), bollards on the edge, lamps, a cafe's tables and umbrellas, the cafe behind where there's room
  const R = (m.world3.ferries || []).find((r) => r.name === 'River Water Bus');
  out.quays = [];
  for (const [ix, name, cafe] of [[0, 'Old Town Quay', 'The Quayside Cafe'], [1, 'Willow Crossing Quay', "The Lock Keeper's Cafe"]]) {
    const st = R && R.stops[ix];
    if (!st || !st.shore) continue;
    const [sx, sy] = st.shore, ox = st.ox, oy = st.oy, px = -oy, py = ox;
    let tiles = 0, paved = 0, bollards = 0;
    const edges = new Map();
    for (let k = -20; k <= 20; k++) {
      if (Math.abs(k) <= 4) continue;   // (the pontoon's gangway and its boards ashore)
      // the shore's edge on this line: in from the water
      let ex = null, ey = null;
      for (let o = 6; o >= -10; o--) { const x = sx + px * k + ox * o, y = sy + py * k + oy * o; if (!K.wet(x, y) && K.inF(x, y) && m.land[y * W + x]) { ex = x; ey = y; break; } }
      if (ex === null) continue;
      // three tiles of stone in from the edge (a promenade's paving already there is the quay)
      for (let d = 0; d < 3; d++) { const x = ex - ox * d, y = ey - oy * d, i = y * W + x; if (K.open(x, y)) { m.tiles[i] = T.PLAZA; m.reserve[i] |= 4; gone.add(i); paved++; } if (m.tiles[i] === T.PLAZA) tiles++; }
      if (m.tiles[ey * W + ex] !== T.PLAZA) continue;
      edges.set(k, [ex, ey]);
      if (k % 4 === 0) { K.prop('bollard', ex + 0.5 + ox * 0.35, ey + 0.5 + oy * 0.35, 0); bollards++; }
      if (k % 9 === 0 && m.tiles[(ey - oy * 2) * W + ex - ox * 2] === T.PLAZA) K.prop('lamp', ex + 0.5 - ox * 2, ey + 0.5 - oy * 2, 0);
    }
    clearTiles();
    // the cafe: a small building behind the quay (open ground or paving within 20 tiles), its tables on the quay
    let cb = null;
    for (let o = 4; o <= 20 && !cb; o += 2) for (const k of [8, -8, 12, -12, 16, -16, 20, -20]) {
      const x = sx + px * k - ox * o, y = sy + py * k - oy * o;
      cb = K.addBld(x - 3, y - 2, 7, 5, 'cafe', cafe, 'tile', { spec: { floors: 1, style: 'brick', wallColor: '#a86a4a', pitch: 'gable', roof: 'tile', roofColor: '#8a3a2a', slope: 0.5 } });
      if (cb) break;
    }
    let tables = 0;
    for (const k of [7, 10, 13, 16, -7, -10, -13, -16]) {
      const E = edges.get(k);
      if (!E) continue;
      const x = E[0] - ox * 2, y = E[1] - oy * 2;
      if (K.inF(x, y) && m.tiles[y * W + x] === T.PLAZA) { K.prop('cafetable', x + 0.5, y + 0.5, 0); if (tables % 2 === 0) K.prop(tables % 4 ? 'umbrella_r' : 'umbrella_y', x + 0.5, y + 0.2, 0); tables++; }
    }
    K.landmark(name, 'quay', Math.min(sx + px * -20, sx + px * 20) - 3, Math.min(sy + py * -20, sy + py * 20) - 3, Math.max(sx + px * -20, sx + px * 20) + 4, Math.max(sy + py * -20, sy + py * 20) + 4);
    out.quays.push({ name, stop: st.name, shore: [sx, sy], tiles, paved, bollards, tables, cafe: cb ? cb.id : -1 });
  }
  // the prison's harbour: round the Prison Boat's island stop - a stone pier beside the pontoon, the harbour office
  // ashore, the path up to the compound's gate
  const P = (m.world3.ferries || []).find((r) => r.name === 'Prison Boat');
  const st = P && P.stops.find((s) => /Prison Island/.test(s.name));
  if (st && st.shore && m.prison) {
    const [sx, sy] = st.shore, ox = st.ox, oy = st.oy, px = -oy, py = ox;
    let pier = 0;
    const cx = sx + px * 8, cy = sy + py * 8;
    for (let k = -3; k <= 14; k++) for (let o = -2; o <= 2; o++) {
      const x = cx + ox * k + px * o, y = cy + oy * k + py * o;
      if (K.wet(x, y)) { if (K.ground(x, y, T.PLAZA, D.prison)) pier++; }
      else if (k <= 0 && K.open(x, y)) { m.tiles[y * W + x] = T.PLAZA; m.reserve[y * W + x] |= 4; gone.add(y * W + x); }
    }
    for (let k = 1; k <= 14; k += 3) for (const o of [-2, 2]) { const x = cx + ox * k + px * o, y = cy + oy * k + py * o; if (m.tiles[y * W + x] === T.PLAZA) K.prop('bollard', x + 0.5 + px * o * 0.15, y + 0.5 + py * o * 0.15, 0); }
    K.prop('lamp', cx + ox * 14 + 0.5, cy + oy * 14 + 0.5, 0);
    // the path: from the pier's root to the gate (a stone path, 3 across)
    const [x0, y0, x1, y1] = PRISON.box, [g0, g1] = PRISON.gate, gx = (g0 + g1) / 2;
    const path = [[cx - ox * 3, cy - oy * 3], [cx - ox * 3, y1 + 8], [gx, y1 + 8], [gx, y1]];
    const before = new Set(gone);
    for (let j = 1; j < path.length; j++) {
      const [ax, ay] = path[j - 1], [bx, by] = path[j], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let t = 0; t <= n; t++) { const x0p = Math.round(ax + (bx - ax) * t / n), y0p = Math.round(ay + (by - ay) * t / n); for (let d = -1; d <= 1; d++) { const x = x0p + (ax === bx ? d : 0), y = y0p + (ay === by ? d : 0), i = y * W + x; if (K.open(x, y) || (K.inF(x, y) && m.tiles[i] === T.DIRT)) { m.tiles[i] = T.PLAZA; m.reserve[i] |= 4; gone.add(i); } } }
    }
    const pathTiles = gone.size - before.size;
    clearTiles();
    let office = null;
    for (const o of [6, 9, 12]) { if (office) break; for (const s of [1, -1]) { const x = cx - ox * o + px * s * 7, y = cy - oy * o + py * s * 7; office = K.addBld(Math.round(x) - 3, Math.round(y) - 2, 6, 5, 'prison', 'Prison Harbour Office', 'tar', { spec: { ...STONE, floors: 1 } }); if (office) break; } }
    m.prison.dock = { x: (cx + ox * 14 + 0.5) * TILE, y: (cy + oy * 14 + 0.5) * TILE };
    for (const [dx, dy] of [[0, -1], [0, 1]]) m.prison.guards.push({ x: (cx - ox * 2 + px * 3 * dy + 0.5) * TILE, y: (cy - oy * 2 + py * 3 * dy + 0.5) * TILE, harbour: true });
    K.landmark('Prison Island Harbour', 'harbour', Math.min(cx, cx + ox * 14) - 4, Math.min(cy, cy + oy * 14) - 4, Math.max(cx, cx + ox * 14) + 5, Math.max(cy, cy + oy * 14) + 5);
    out.harbour = { stop: st.name, shore: [sx, sy], pier, path: pathTiles, office: office ? office.id : -1 };
  }
  if (m.prison) { const [x0, y0] = PRISON.box; m.prison.gate = m.gates.findIndex((g) => g.rule === 'police' && g.rect && g.rect.tx === x0 && g.rect.ty === y0); if (out.prison) out.prison.gate = m.prison.gate; }
  m.world3.water = out;
  return out;
}
