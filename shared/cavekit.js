// The mine cave as a scene (the nature showcase, 2026-10-31: concept N3, "the mine cave" - and MI2, MI4, MI5 beside it),
// and the kit it is built from, spread to the other caves. A cave whose mine is marked with a scene (World v3's Old
// Granite Mine and Copper Gulch Mine: shared/world3-caves.js marks them) is laid out round one big chamber just in
// from its mouth, the concept's composition at the game's scale (about 46 x 31 tiles; the player one tile):
//   - the way in from the adit's mouth comes up into the chamber's south-west; a light well in its north-west corner
//     (the roof fallen in: daylight down a rubble slope, ferns and grass in it), orange mushrooms, puddles on the
//     path reflecting the lanterns, a broken ore cart and its timbers by the west wall, a barrel;
//   - on the north wall the timbered adit of the old workings, a lantern hung in it, the rails coming out of it past
//     an ore cart and curving down onto a timber trestle over the lake's north arm; a chest, a barrel, a pickaxe, a
//     lantern on its post, crates stacked at the trestle's east end;
//   - the lake: clear water glowing teal over its pebbles, deep in its middle, stalagmites standing in it, a rock mass
//     on its west shore, a rope fence along it; stalactites hanging from the walls, bats asleep on the roof;
//   - crystal grottos off its east side, north and south (blue crystals, the rock gone blue-violet);
//   - beyond the adit the drift runs on (timber sets, lanterns, the rails) to the template's chambers, further in.
// The kit (things, rails, trestles, lakes that glow, puddles, hanging stalactites, roosts, light wells, timber sets)
// is the same for every cave: kitCavern lifts the Redwood Caverns with it (a trestle over the Great Lake, crystal
// grottos off its rim, rails and a cart at the Ore Face, timber sets with lanterns through the Stalactite Hall).
// Loaded with shared/caverns.js (the server, the cave's view, the tests) - never the page. Integer hashes and plain
// arithmetic, no trigonometry: the same in every engine.
import { TILE } from './constants.js';
import { C, _ug } from './underground.js';

const { cellAt, setCell, capsule, disc, wallSpots, len } = _ug;

// The scene, in tiles from its centre (u east, v south - mirrored by the mine's mx and the cave's flip). centre: from
// the mine's mouth; push (px): how much further in the template's chambers lie (beyond the scene, the adit's drift).
export const N3 = {
  centre: [4, -17.5], push: 1150, stone: 'mine', name: 'the lantern lake',
  floor: [
    ['c', -16, -12.5, -13, -6, 3.2], ['d', -15.5, -12.5, 3], ['c', -13, -5, -6, 2, 6], ['d', -10, 0, 6.2], ['c', -7, 4, -5, 14.5, 3.4],
    ['c', -4, -7, 12, -7, 2.7], ['c', -6, -4, -1, -6, 3.2], ['d', -2, -3, 2.6], ['c', 7.5, -8, 7.5, -13, 2.3],
    ['c', 12, -6.5, 14.2, -1, 2.5], ['c', 13, -6, 18, -10, 2.1], ['d', 19, -10, 3.3],
    ['d', 6.5, 4, 10], ['c', 12, 8, 18, 9, 2.3], ['d', 19.5, 9, 3.3], ['c', -3, 9, 2, 13, 2.2],
  ],
  rock: [['d', -5, 0.8, 1.5], ['d', -11.5, 9, 1.4], ['d', 16.2, -1.5, 1.2], ['d', 16, 4, 1.6]],
  water: [['d', 4, 3, 5.6], ['d', 9, 4.5, 5.6], ['d', 6, 7.8, 4.6], ['d', 1.8, 0.8, 3.2], ['d', 6, -0.4, 3.6], ['d', 10.2, -0.6, 3.2], ['d', 11.6, 8.6, 3]],
  deep: [['d', 6.5, 4.2, 3.4]],
  shore: [['c', 1.6, 11.8, 13.6, 10.6, 1.25], ['c', 14.2, -1.2, 15.4, 6.5, 1.4], ['c', 15.4, 6.5, 13.6, 10.6, 1.3]],
  isles: [['d', 9.5, 8.6, 1.1], ['d', 3.2, 6, 0.9], ['d', 11.4, 5.4, 0.8], ['d', 1.2, 2.6, 0.9], ['d', -0.8, 5.2, 1.3], ['d', 0.6, 9.2, 1.0], ['d', 12.8, 1.2, 0.9]],
  trestles: [[-1.6, -3.3, 13.2, -3.3, 30]],
  rails: [[[7.5, -15], [7.5, -11.5], [7.2, -9.6], [6.3, -7.6], [4.9, -5.6], [3.3, -3.9], [1.2, -3.3], [-1.4, -3.3]]],
  things: [
    ['adit', 7.5, -12.3], ['cart', 7.4, -10.2, { a: 1 }], ['chest', -1.6, -8.2], ['barrel', 1.6, -7.6], ['pick', 0, -6.8],
    ['crates', 12.4, -6.6], ['crate', 13.6, -5.4], ['plank', 3.4, -9.4], ['brokencart', -15, -2.2], ['timbers', -14.8, 1.4],
    ['barrel', -17, -0.4], ['shroom', -16, -5.6], ['shroom', -13.6, -8.4], ['shroom', -11.5, 4.6], ['shroom', -6.6, 11], ['ropefence', 0.8, 6, { to: [2.4, 10.6] }],
    ['fence', 13.2, 11.6], ['shroom', 14.6, 1.2], ['rubble', -16.4, -10.6], ['rubble', -14, -12.8],
    ['rubble', -6.4, 1.8], ['rubble', -3.6, -0.4], ['rubble', -18.2, 3], ['rubble', -9, 12.4], ['rubble', 14.6, -2.6], ['rubble', 5.6, -8.8], ['rubble', -1, 12.6],
    ['fern', -17.4, -6.6], ['fern', -12.8, -10.4], ['fern', -17, -12.6], ['fern', -6.8, 1.6], ['fern', -3.8, 2.4], ['fern', -12.6, 6.8], ['fern', -0.6, 2.8],
    ['fern', 13.8, -0.4], ['fern', 16.6, 6.6], ['fern', -2.4, 8.6], ['fern', 2.4, -6.4], ['fern', -8.4, -6.6], ['fern', -7.6, 13.2],
  ],
  lanterns: [[3.6, -8.6], [10.4, -3.6], [-4.6, -7.4], [-8.4, 3.6], [5.6, -3.6], [-1.2, -4.4], [12.2, -7.8]],
  hung: [[9.6, -12.6], [5.4, -12.4]],
  puddles: [[-13, -3.6, 1.2], [-9.6, -1.4, 1.5], [-6.2, 6.4, 1.4], [-3.2, 10.6, 1]],
  lakes: [[6.5, 3.8, 9.5]],
  shafts: [[-15.4, -11.8, 104]],
  spikes: [[11.4, 5.2, 1.3], [1.2, 2.4, 1.0], [-0.8, 4.8, 1.4], [12.8, 1, 1.0], [-6.2, -0.6, 1.2], [-4, 2.2, 1.0], [-10.6, 8, 1.3], [-12.4, 10, 0.8], [15.6, -3.2, 1.25], [17, -0.4, 0.9], [15.2, 2.8, 1.1], [9.5, 8.4, 1.3], [3.2, 5.8, 1.1], [-0.6, 4.6, 0.8], [17.2, 5.6, 1.2], [-17.2, -8, 0.9]],
  roosts: [[-11.6, -9.6]],
  grottos: [['xtalN', 19, -10, 90], ['xtalS', 19.5, 9, 90]],
  drift: [[7.5, -12.3], [7.5, -16.5]],
  // the packed-dirt paths worn across the floor: up from the way in, to the adit, out onto the trestle, up to the well
  paths: [[[-6, 14.5], [-7.4, 8], [-9.6, 2.4], [-8.6, -3.2], [-4.6, -6.4], [1, -7.6], [5.4, -7.8], [7.4, -10.4]], [[-8.6, -3.2], [-4.4, -3.6], [-1.4, -3.3]], [[-9.6, 2.4], [-13.4, -2], [-14.4, -7.4], [-15.4, -11.4]], [[12.8, -3.6], [13.6, -6]]],
};
// what each mine's scene is: the concept's (Old Granite), mirrored east-west in the desert's red rock (Copper Gulch)
export const SCENES = { n3: { ...N3, mx: 1 }, n3red: { ...N3, mx: -1, stone: 'red' } };

// ---- a mine cave's scene: carved (after the template's chambers and passages, before the dressing) -----------------
export function carveScene(K, cr, s2) {
  const sc = SCENES[K.scene && K.scene.kit] || SCENES.n3, mx = sc.mx || 1, fl = K.flip || 1;
  const Sx = K.mouth.x + sc.centre[0] * TILE * mx, Sy = K.mouth.y - 10 + sc.centre[1] * TILE * fl;
  const P = (u, v) => [Math.round(Sx + u * TILE * mx), Math.round(Sy + v * TILE * fl)];
  const shape = (q, code, over, rough, seed) => {
    if (q[0] === 'c') { const [ax, ay] = P(q[1], q[2]), [bx, by] = P(q[3], q[4]); capsule(cr, ax, ay, bx, by, q[5] * TILE, code, over, rough, seed); }
    else { const [x, y] = P(q[1], q[2]); disc(cr, x, y, q[3] * TILE, code, over, rough, seed); }
  };
  // the way in: from the mouth up into the chamber's south passage
  const [ex, ey] = P(-6, 14.5);
  capsule(cr, K.mouth.x, K.mouth.y - 4 * fl, K.inside.x, K.inside.y, 44, C.FLOOR, false, 0.25, s2 + 9);
  capsule(cr, K.inside.x, K.inside.y, ex, ey, 52, C.FLOOR, false, 0.3, s2 + 9);
  for (const q of sc.floor) shape(q, C.FLOOR, false, 0.5, s2 + 31);
  for (const q of sc.water) shape(q, C.POOL, true, 0.35, s2 + 32);
  for (const q of sc.deep) shape(q, C.RIVER, true, 0.3, s2 + 33);
  for (const q of sc.shore) shape(q, C.FLOOR, true, 0.2, s2 + 36);   // (the paths round the lake's south and east shores)
  for (const q of sc.rock) shape(q, C.ROCK, true, 0.4, s2 + 34);
  for (const q of sc.isles) shape(q, C.ROCK, true, 0, 0);
  // the drift: on from the adit to the template's hall (timber sets, lanterns and the rails along it: the kit below)
  const drift = sc.drift.map(([u, v]) => P(u, v)), hall = K.ch.hall;
  drift.push([hall.x, hall.y]);
  for (let i = 1; i < drift.length; i++) capsule(cr, drift[i - 1][0], drift[i - 1][1], drift[i][0], drift[i][1], 44, C.FLOOR, false, 0.2, s2 + 35);
  const kit = newKit();
  for (const [u0, v0, u1, v1, hw] of sc.trestles) { const [x0, y0] = P(u0, v0), [x1, y1] = P(u1, v1); kit.trestles.push({ x0, y0, x1, y1, hw }); capsule(cr, x0, y0, x1, y1, hw, C.DOCK, true); }
  for (const line of sc.rails) kit.rails.push(line.map(([u, v]) => P(u, v)));
  for (const line of sc.paths || []) kit.paths.push(line.map(([u, v]) => P(u, v)));
  kit.rails[0].unshift([hall.x, hall.y], ...drift.slice(1, -1).reverse());   // (the rails on up the drift to the hall)
  for (const [t, u, v, ex2] of sc.things) {
    const [x, y] = P(u, v), q = { t, x, y };
    if (ex2 && ex2.to) { const [tx, ty] = P(ex2.to[0], ex2.to[1]); q.tx = tx; q.ty = ty; }
    if (ex2 && ex2.a) q.a = ex2.a;
    kit.things.push(q);
  }
  for (const [u, v] of sc.lanterns) { const [x, y] = P(u, v); kit.lanterns.push({ x, y, big: 1 }); }
  for (const [u, v] of sc.hung) { const [x, y] = P(u, v); kit.lanterns.push({ x, y, hung: 1, nx: 0, ny: -fl, big: 1 }); }
  for (const [u, v, r] of sc.puddles) { const [x, y] = P(u, v); kit.puddles.push({ x, y, r: Math.round(r * TILE) }); }
  for (const [u, v, r] of sc.lakes) { const [x, y] = P(u, v); kit.lakes.push({ x, y, r: Math.round(r * TILE) }); }
  for (const [u, v, r] of sc.shafts) { const [x, y] = P(u, v); kit.shafts.push({ x, y, r, lean: -40 * mx }); }
  for (const [u, v, s] of sc.spikes) { const [x, y] = P(u, v); kit.spikes.push({ x, y, s }); }
  for (const [u, v] of sc.roosts) { const [x, y] = P(u, v); kit.roosts.push({ x, y, r: 240 }); }
  // timber sets along the drift (every 4 tiles), the adit's portal the first
  for (let i = 1; i < drift.length; i++) {
    const [ax, ay] = drift[i - 1], [bx, by] = drift[i], l = len(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
    for (let s = i === 1 ? 110 : 60; s < l - 60; s += 128) kit.timbers.push({ x: Math.round(ax + ux * s), y: Math.round(ay + uy * s), ux: Math.round(ux * 1000) / 1000, uy: Math.round(uy * 1000) / 1000, l: 40, r: 40 });
    if (i > 1) kit.lanterns.push({ x: Math.round((ax + bx) / 2 - uy * 34), y: Math.round((ay + by) / 2 + ux * 34), hung: 1, nx: -uy, ny: ux });
  }
  // the scene's chamber (its stone, its depth) and the crystal grottos off it (their glow: the dressing's)
  const r0 = 22 * TILE, sc0 = { id: 'scene', name: sc.name, x: Math.round(Sx), y: Math.round(Sy), r: r0, depth: 1, glow: null, kind: 'scene', stone: sc.stone };
  K.chambers.push(sc0); K.ch.scene = sc0;
  for (const [id, u, v, r] of sc.grottos) { const [x, y] = P(u, v), q = { id, name: 'a crystal grotto', x, y, r, depth: 2, glow: 'crystal', kind: 'xtal' }; K.chambers.push(q); K.ch[id] = q; }
  // its way in: the light along the passage up from the mouth into the chamber (the view's mouthSpots: toward it)
  const [jx, jy] = P(-8, 2);
  K.ch.entry = { id: 'entry', x: jx, y: jy, r: 64 };
  K.mouths = [{ name: K.name, kind: 'adit', x: K.mouth.x, y: K.mouth.y, out: { x: K.mouth.x, y: K.mouth.y + 26 * fl }, inside: K.inside, toward: 'entry' }];
  kit.drips = drips(cr, Sx, Sy, r0 + 6 * TILE, fl, 54);
  K.kit = kit;
}

const newKit = () => ({ paths: [], trestles: [], rails: [], things: [], lanterns: [], puddles: [], lakes: [], shafts: [], spikes: [], roosts: [], timbers: [], drips: [] });

// stalactites hanging from the roof's rim: floor cells with rock on their roof side (north, or south in a flipped
// cave), every so many px along it, their lengths varied
function drips(R, x, y, r, fl, every) {
  const out = [], seen = new Set();
  for (const s of wallSpots(R, x, y, r)) {
    if (s.ny !== -fl) continue;
    const k = Math.floor(s.x / every) + ',' + Math.floor(s.y / (every * 2));
    if (seen.has(k)) continue;
    seen.add(k);
    const h = hsh(s.x, s.y);
    out.push({ x: Math.round(s.x + (h - 0.5) * 20), y: Math.round(s.y - 14 * fl), s: Math.round((0.6 + h * 1.1) * 100) / 100 });
  }
  return out;
}
const hsh = (x, y) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---- the kit spread to a cavern: carved with it (after its river, lake and docks) -----------------------------------
// - a timber trestle over the great lake, shore to shore across its north half, a lantern at each end;
// - two crystal grottos off the lake's rim (north-east, south-west), dug back into the rock;
// - the ore face's rails: in from its passage to the face, an ore cart on them, crates and a barrel;
// - timber sets with lanterns through the stalactite hall and the echo hall; stalactites along every chamber's roof;
// - the lake glowing teal, puddles about the halls' floors.
export function kitCavern(cr, K, s2) {
  const P = K.plan, kit = newKit(), lake = P.lake;
  if (lake) {
    const y = lake.y + Math.round(lake.r * 0.42), half = Math.round(lake.r * 1.05);   // (south of the river's way through it and the boats' moorings)
    let x0 = lake.x - half, x1 = lake.x + half;
    // (from dry floor to dry floor: each end walked out to the shore)
    for (let k = 0; k < 12 && cellAt(cr, Math.floor(x0 / TILE), Math.floor(y / TILE)) !== C.FLOOR; k++) x0 -= TILE;
    for (let k = 0; k < 12 && cellAt(cr, Math.floor(x1 / TILE), Math.floor(y / TILE)) !== C.FLOOR; k++) x1 += TILE;
    kit.trestles.push({ x0, y0: y, x1, y1: y, hw: 30 });
    capsule(cr, x0, y, x1, y, 30, C.DOCK, true);
    kit.lanterns.push({ x: x0 + 20, y: y - 40, big: 1 }, { x: x1 - 20, y: y - 40, big: 1 });
    kit.lakes.push({ x: lake.x, y: lake.y, r: lake.r + 40 });
    // the grottos: dug back from the lake's rim, a short passage to each
    for (const [id, cx, cy] of [['xtalA', 0.69, -0.73], ['xtalB', -0.64, 0.77]]) {
      const gx = Math.round(lake.x + cx * (lake.r + 330)), gy = Math.round(lake.y + cy * (lake.r + 330)), rx = Math.round(lake.x + cx * (lake.r + 30)), ry = Math.round(lake.y + cy * (lake.r + 30));
      capsule(cr, rx, ry, gx, gy, 46, C.FLOOR, false, 0.4, s2 + 41);
      disc(cr, gx, gy, 100, C.FLOOR, false, 0.5, s2 + 42);
      const q = { id, name: 'a crystal grotto', x: gx, y: gy, r: 90, depth: 3, glow: 'crystal', kind: 'xtal' };
      K.chambers.push(q); K.ch[id] = q;
    }
  }
  const ore = K.chambers.find((c) => c.kind === 'ore'), ps = ore && K.passages.find((q) => q.a === ore.id || q.b === ore.id);
  if (ore && ps && ps.vias[0]) {
    const a = ps.vias[0], dx = ore.x - a.x, dy = ore.y - a.y, l = len(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const pts = [[a.x, a.y], [Math.round(a.x + dx * 0.45 + nx * 18), Math.round(a.y + dy * 0.45 + ny * 18)], [Math.round(ore.x - dx / l * 70), Math.round(ore.y - dy / l * 70)]];
    kit.rails.push(pts);
    kit.lanterns.push({ x: Math.round(ore.x + nx * 60 - dx / l * 30), y: Math.round(ore.y + ny * 60 - dy / l * 30) });
    kit.things.push({ t: 'cart', x: pts[1][0], y: pts[1][1], a: 1 }, { t: 'crates', x: Math.round(ore.x + nx * 110), y: Math.round(ore.y + ny * 110) }, { t: 'barrel', x: Math.round(ore.x - nx * 100), y: Math.round(ore.y - ny * 100) });
  }
  for (const id of ['pillars', 'echo']) {
    const c = K.ch[id];
    if (!c) continue;
    for (const dx of [-0.55, 0.55]) {
      const x = Math.round(c.x + dx * c.r), y = c.y;
      let l = 8, r = 8;
      while (l < 200 && cellAt(cr, Math.floor((x) / TILE), Math.floor((y - l) / TILE)) > 0) l += 8;
      while (r < 200 && cellAt(cr, Math.floor((x) / TILE), Math.floor((y + r) / TILE)) > 0) r += 8;
      if (l + r < 360) { kit.timbers.push({ x, y, ux: 1, uy: 0, l: l - 6, r: r - 6 }); kit.lanterns.push({ x: x + 14, y: y - l + 20, hung: 1, nx: 0, ny: -1 }); }
    }
  }
  for (const c of K.chambers) {
    if (c.kind === 'lake' || c.kind === 'sea') continue;
    kit.drips.push(...drips(cr, c.x, c.y, c.r + 60, 1, 70));
    if (c.kind === 'hall' || c.kind === 'glow') { const h = hsh(c.x, c.y); kit.puddles.push({ x: Math.round(c.x + (h - 0.5) * c.r), y: Math.round(c.y + (hsh(c.y, c.x) - 0.5) * c.r * 0.6), r: 30 + Math.round(h * 16) }); }
  }
  K.kit = kit;
}

// ---- the kit into the cave's dressing (after shared/caverns.js lightCave): its lanterns, timbers, stalagmites, roosts,
// light wells joined to the cave's own; the rest kept on K for the view (K.kit) ------------------------------------
export function dressKit(K) {
  const kit = K.kit;
  if (!kit) return;
  // (a puddle, a thing on the floor: only where the floor is dry)
  const R = K.region, dry = (x, y) => cellAt(R, Math.floor(x / TILE), Math.floor(y / TILE)) === C.FLOOR;
  kit.puddles = kit.puddles.filter((q) => dry(q.x, q.y));
  K.lanterns = [...(K.lanterns || []), ...kit.lanterns];
  K.timbers = [...(K.timbers || []), ...kit.timbers];
  K.spikes = [...(K.spikes || []), ...kit.spikes.filter((q) => cellAt(R, Math.floor(q.x / TILE), Math.floor(q.y / TILE)) !== C.DOCK)];
  for (const q of K.spikes) q.nohang = 1;   // (the roof's own stalactites hang from its rim: kit.drips)
  K.shafts = [...(K.shafts || []), ...kit.shafts];
  K.roosts = [...(K.roosts || []), ...kit.roosts.map((q, i) => ({ i: (K.roosts || []).length + i, ...q }))];
  K.things = [...(K.things || []), ...kit.things.filter((q) => /^(adit|fence|ropefence)$/.test(q.t) || dry(q.x, q.y))];
  // the lakes' shores softened: boulders and stalagmites along the water's edge where it meets the floor (not on the
  // trestle's landings, not on the paths)
  for (const lk of kit.lakes) {
    const tx0 = Math.floor((lk.x - lk.r * 1.5) / TILE), tx1 = Math.floor((lk.x + lk.r * 1.5) / TILE), ty0 = Math.floor((lk.y - lk.r * 1.5) / TILE), ty1 = Math.floor((lk.y + lk.r * 1.5) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const v = cellAt(R, tx, ty);
      if (v !== C.POOL) continue;
      let shore = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = cellAt(R, tx + dx, ty + dy); if (w === C.FLOOR || w === C.ROCK) shore++; if (w === C.DOCK) shore = -9; }
      if (shore < 1) continue;
      const h = hsh(tx * 7, ty * 13), x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (kit.paths.some((pl) => pl.some(([px, py]) => len(px - x, py - y) < 70))) continue;
      const bx = Math.round(x + (hsh(tx, ty * 3) - 0.5) * 22), by = Math.round(y + (hsh(tx * 5, ty) - 0.5) * 14);
      if (h < 0.32 && !kit.things.some((q) => q.t === 'boulder' && len(q.x - bx, q.y - by) < 56)) { const q = { t: 'boulder', x: bx, y: by, s: Math.round((0.4 + hsh(ty, tx) * 1.6) * 100) / 100 }; kit.things.push(q); K.things.push(q); }
      else if (h > 0.5 && h < 0.62) K.spikes.push({ x: Math.round(x), y: Math.round(y), s: 0.7 + h * 0.6, nohang: 1 });
    }
  }
  // the grottos' crystals: blue, and big (the concept's) - the dressing's glows in them
  const gro = K.chambers.filter((c) => /^xtal/.test(c.id));
  for (const g of K.glow || []) if (g.kind === 'crystal' && gro.some((c) => len(g.x - c.x, g.y - c.y) < c.r + 40)) { g.hue = 1; g.big = 1; }
  // the chamber's dim fill: its lanterns, the lake and the crystals between them light it all a little
  if (K.ch.scene) kit.fill = { x: K.ch.scene.x, y: K.ch.scene.y, r: K.ch.scene.r + 4 * TILE };
  void setCell;
}
