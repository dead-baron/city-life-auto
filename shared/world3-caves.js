// The Redwood Caverns (the nature program, 2026-10-20: Nature-B1, the cave network, and Nature-B2, its ways in). Under
// Highland Woods an underground river runs from behind Redwood Creek's falls down through a string of caverns to a sea
// cave at Redwood Cove - about a kilometre of it, west and down to the sea:
//   - the ways in (B2): a cave mouth in the basalt beside Redwood Creek Falls, up timber stairs from a railed path along
//     the plunge pool's bank, a lantern at the mouth; and a sea cave in a columnar basalt cliff at the back of a cobble
//     beach dug into the cove's south end - a rowboat drawn up on the cobbles, barrels, driftwood, surf on the rocks;
//   - the chambers along the river (B1), from the falls: the Falls Gallery (the creek seeping in through its roof into
//     the river's head pool), the Glow Grotto (teal mushrooms, glow-worms, bats), the Crystal Vault up a passage off it
//     (blue and violet crystals, chests), the Great Lake (stalagmites, docks round it - the cave fish live here), the
//     Bear's Den off its outflow (a mossy floor, the bear asleep), the Treasure Chamber (chests and gold by lantern
//     light), the Ore Face (gold and amethyst seams, the old miners' gear) and the Sea Cave (the river's tidal pool,
//     smugglers' barrels and crates on its cobbles);
//   - the river: two cascades where it steps down (white water a boat can't pass - walk round on the bank's stairs),
//     timber docks with lanterns along it, five with a rowboat waiting (shared/vehicles.js rowboat), a walkable bank the
//     whole way.
// The surface work is done here, on the map; the underground is a plan (m.caverns: px, plain numbers) that
// shared/underground.js carves and dresses like a mine's cave, and server/systems/underground.js runs (its mouths, its
// boats, its chests). For the whole-world build only (shared/world3-world.js calls buildCaves3 from its done hook).
// Deterministic: authored shapes, integer hashes; Math's trig only inside generateCity (withDeterministicMath).
import { TILE, T } from './constants.js';

const RES = 32;
const P2 = (x, y) => [Math.round((x + 0.5) * TILE), Math.round((y + 0.5) * TILE)];
const hh = (a, b, s) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// The network (tiles, the world's own): its chambers, the river's course from its head below the falls to the sea pool,
// where it steps down, where its docks are. (Authored for World v3's Highland Woods: the falls' mouth and the sea cave's
// are found on the map and the plan meets them.)
export const CAVERNS = {
  name: 'the Redwood Caverns', key: 'redwood', title: 'Redwood Caverns',
  // (on: the river runs through it - its course doesn't wander there)
  chambers: [
    { id: 'gallery', name: 'the Falls Gallery', at: [1546, 1290], r: 9, depth: 1, kind: 'hall', on: 1 },
    { id: 'grotto', name: 'the Glow Grotto', at: [1474, 1255], r: 12, depth: 1, kind: 'glow', glow: 'mush+worms', link: [1474, 1268] },
    { id: 'crystal', name: 'the Crystal Vault', at: [1300, 1186], r: 11, depth: 3, kind: 'crystal', glow: 'crystal', link: [1306, 1219] },
    { id: 'pillars', name: 'the Stalactite Hall', at: [1240, 1214], r: 11, depth: 2, kind: 'hall', on: 1 },
    { id: 'lake', name: 'the Great Lake', at: [1150, 1214], r: 22, depth: 2, kind: 'lake', on: 1 },
    { id: 'den', name: 'the Bear\'s Den', at: [1006, 1262], r: 10, depth: 3, kind: 'den', link: [1018, 1234] },
    { id: 'worms', name: 'the Glow-worm Gallery', at: [902, 1200], r: 12, depth: 2, kind: 'glow', glow: 'worms', on: 1 },
    { id: 'treasure', name: 'the Treasure Chamber', at: [802, 1198], r: 10, depth: 3, kind: 'treasure', link: [806, 1172] },
    { id: 'echo', name: 'the Echo Hall', at: [716, 1147], r: 11, depth: 2, kind: 'hall', on: 1 },
    { id: 'ore', name: 'the Ore Face', at: [650, 1098], r: 10, depth: 3, kind: 'ore', ores: ['goldOre', 'gem', 'goldOre', 'silverOre'], link: [646, 1130] },
    { id: 'seacave', name: 'the Sea Cave', at: [515, 1100], r: 11, depth: 1, kind: 'sea', on: 1 },
  ],
  // the river, from its head (in the gallery) to the sea pool
  river: [[1553, 1288], [1530, 1284], [1500, 1277], [1472, 1270], [1444, 1262], [1420, 1257], [1396, 1250], [1362, 1239], [1324, 1227], [1284, 1219], [1244, 1214], [1204, 1212], [1150, 1214], [1098, 1222], [1072, 1228], [1052, 1231], [1028, 1232], [992, 1226], [952, 1214], [912, 1200], [872, 1186], [832, 1175], [792, 1166], [752, 1156], [712, 1146], [672, 1136], [632, 1128], [592, 1120], [556, 1112], [530, 1106], [512, 1103]],
  hw: 2, bank: 2.4,   // (tiles: the river's half-width, the bank either side of it - wider and narrower as it goes)
  wander: { a: 7, wave: 70 },   // (tiles: how far its course swings either side of the line above, and how long a swing is)
  lake: { at: [1150, 1214], r: 16 },
  sea: { at: [503, 1101], r: 5 },
  cascades: [1418, 1060],   // (x: where the river steps down - the first after the grotto, the second the lake's outflow)
  // docks: x along the river, which bank (+1: the right of the way downstream, -1 the left), boat: one waits there
  docks: [{ x: 1526, side: -1, boat: 1 }, { x: 1404, side: -1, boat: 1 }, { lake: -0.5, boat: 1 }, { lake: 2.2, boat: 0 }, { x: 1040, side: 1, boat: 1 }, { x: 808, side: -1, boat: 0 }, { x: 650, side: -1, boat: 0 }, { x: 532, side: -1, boat: 1 }],
};

export function buildCaves3(m, H3) {
  const out = { built: false, missed: [] };
  if (!H3 || !H3.addProp) return out;
  const W = m.w, HH = m.h, inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH, idx = (x, y) => y * W + x;
  const props = [], P = (t, x, y, r = 0, ex = null) => props.push([t, Math.round(x), Math.round(y), r, ex]);
  const drop = new Set();
  const dropNear = (x, y, r, keep = null) => { for (const p of m.props) if (p && p.t !== 'painted' && (!keep || !keep.test(p.t)) && Math.hypot(p.x - x, p.y - y) < r) drop.add(p.x + ',' + p.y); };
  const mouths = [];
  // ---- 1. the way in behind the falls (B2 panel 1) --------------------------------------------------------------------
  const creek = (m.natureSites || []).find((s) => s.kind === 'creek' && s.name === 'Redwood Creek');
  if (!creek || !creek.gorge || !creek.falls) { out.missed.push('Redwood Creek\'s falls'); return out; }
  {
    const g = creek.gorge[0], F = creek.falls;   // (the west wall beside the falls, its foot)
    const MX = Math.round(g.x + g.len / 2 - 34), MY = Math.round(g.y + 32);
    const fb = creek.footbridge, fx = fb.x - Math.cos(fb.a) * fb.len * 0.5, fy = fb.y - Math.sin(fb.a) * fb.len * 0.5;   // (the footbridge's west end)
    const wE = fb.x + Math.cos(fb.a) * fb.len * 0.5 < fx ? [fb.x + Math.cos(fb.a) * fb.len * 0.5, fb.y + Math.sin(fb.a) * fb.len * 0.5] : [fx, fy];
    const path = [[MX, MY + 26], [MX + 8, MY + 110], [MX + 40, MY + 190], [wE[0] - 14, wE[1] - 18]];
    // the path: packed dirt along the pool's west bank, what grew or lay on it taken off (the gorge walls stay)
    for (let k = 1; k < path.length; k++) {
      const [ax, ay] = path[k - 1], [bx, by] = path[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 12);
      for (let j = 0; j <= n; j++) {
        const x = ax + (bx - ax) * j / n, y = ay + (by - ay) * j / n;
        for (let ty = Math.floor((y - 30) / TILE); ty <= Math.floor((y + 30) / TILE); ty++) for (let tx = Math.floor((x - 30) / TILE); tx <= Math.floor((x + 30) / TILE); tx++) {
          if (!inF(tx, ty) || Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) > 30) continue;
          const i = idx(tx, ty); if (m.tiles[i] === T.GRASS || m.tiles[i] === T.SAND) { m.tiles[i] = T.DIRT; m.reserve[i] |= RES; }
        }
        dropNear(x, y, 44);
      }
    }
    dropNear(MX, MY, 70);
    (m.tracks ||= []).push({ pts: path.map(([x, y]) => [Math.round(x), Math.round(y)]), hw: 26, bb: [Math.min(...path.map((q) => q[0])) - 40, Math.min(...path.map((q) => q[1])) - 40, Math.max(...path.map((q) => q[0])) + 40, Math.max(...path.map((q) => q[1])) + 40] });
    P('cavemouth', MX, MY, 0, { w: 108, h: 76, style: 'moss' });
    if (m.addSolidProp) for (const dx of [-40, 40]) m.addSolidProp(MX + dx, MY - 6, 12);   // (its rock either side: the way in between)
    P('stairs', MX + 2, MY + 104, 0, { len: 76, h: 22, w: 34 });
    P('lantern', MX + 50, MY + 14, 0);
    P('textsign', MX - 66, MY + 46, 0, { text: 'CAVERNS', bg: '#4a3a24', fg: [240, 228, 196], z: 30 });
    // the rail along the pool's side of the path
    for (let k = 1; k < 3; k++) { const [ax, ay] = path[k - 1], [bx, by] = path[k]; P('rail', ax + 36, ay + 10, 0, { tx: Math.round(bx - ax), ty: Math.round(by - ay - 10) }); }
    mouths.push({ name: 'Redwood Creek Falls', kind: 'falls', x: MX, y: MY + 8, out: { x: MX + 4, y: MY + 60 }, inside: { x: MX, y: MY - 40 }, toward: 'gallery' });
    (m.landmarks ||= []).push({ name: 'Redwood Caverns (the falls)', type: 'cave', x: MX - 120, y: MY - 80, w: 240, h: 200 });
    m.natureSites.push({ kind: 'cavemouth', name: 'Redwood Caverns', where: 'Redwood Creek Falls', x: MX, y: MY + 8 });
    out.falls = [MX, MY];
    void F;
  }
  // ---- 2. the sea cave (B2 panel 2): a cobble beach dug into the cove's south end, the basalt cliff at its back -----
  const cove = (m.natureSites || []).find((s) => s.kind === 'redwoodcove');
  if (!cove) { out.missed.push('Redwood Cove'); return out; }
  {
    // the beach: the sand nearest the cove, its rows south of the fire; the pocket's middle a few tiles in from the woods'
    // edge along the row chosen
    const cy0 = Math.floor(cove.y / TILE), cx0 = Math.floor(cove.x / TILE);
    let best = null;
    for (let ty = cy0 + 8; ty <= cy0 + 30; ty++) {
      let sea = -1, wood = -1;
      for (let tx = cx0 - 40; tx <= cx0 + 10; tx++) {
        if (!inF(tx, ty)) continue;
        const t = m.tiles[idx(tx, ty)];
        if ((t === T.WATER || t === T.DEEP) && !m.land[idx(tx, ty)]) sea = tx;
        if (t === T.SAND && sea >= 0 && wood < 0 && inF(tx + 1, ty) && m.tiles[idx(tx + 1, ty)] !== T.SAND) wood = tx;
      }
      if (sea < 0 || wood < 0 || wood - sea < 6) continue;
      const sc = Math.abs(ty - (cy0 + 18));
      if (!best || sc < best.sc) best = { ty, sea, wood, sc };
    }
    if (!best) { out.missed.push('the cove\'s beach'); return out; }
    const BX = best.wood + 3, BY = best.ty, R = 8;   // (the pocket's middle, tiles)
    // the pocket: cobbles (shingle: sand the ground bake draws as stones) from the sea's edge into the woods, round
    for (let ty = BY - R - 1; ty <= BY + R + 1; ty++) for (let tx = best.sea - 2; tx <= BX + R + 1; tx++) {
      if (!inF(tx, ty)) continue;
      const d = Math.hypot((tx - BX) * 0.8, ty - BY), i = idx(tx, ty), t = m.tiles[i];
      if (d > R + hh(tx, ty, 61) * 1.6 && tx > best.wood) continue;
      if (Math.abs(ty - BY) > R) continue;
      if (t === T.GRASS || t === T.DIRT || t === T.SAND) { m.tiles[i] = T.SAND; m.reserve[i] |= RES | 128; }
    }
    for (let ty = BY - R - 3; ty <= BY + R; ty++) for (let tx = best.sea; tx <= BX + R + 2; tx++) if (Math.hypot((tx - BX) * 0.8, ty - BY) < R + 2) dropNear((tx + 0.5) * TILE, (ty + 0.5) * TILE, 20);
    // the cliff along its north rim (its face to the south, columnar basalt), the mouth in it; a boulder spur on the east
    const rimY = (BY - R + 0.6) * TILE, x0 = (best.sea + 1) * TILE, x1 = (BX + R) * TILE;
    const MX = Math.round((BX - 1.5) * TILE), MY = Math.round(rimY + 16);
    for (let x = x0, k = 0; x < x1; x += 150, k++) {
      if (Math.abs(x + 75 - MX) < 70) continue;   // (where the mouth is: its own rock)
      P('cliffwall', x + 75, rimY + (k % 2) * 6, 0, { len: 150, h: 132 + (k % 3) * 16, d: 84, s: 40 + k });
      if (m.addSolidProp) for (let dx = -64; dx <= 64; dx += 20) m.addSolidProp(x + 75 + dx, rimY - 8, 12);
    }
    P('cavemouth', MX, MY, 0, { w: 136, h: 120, style: 'sea' });
    // the tall trees in front of it in this view (the camera looks north: a redwood south of it hides it) taken off
    const VEG = /^(tree_|redwood|shrub_|bush_|rwstump|rwlog|fern)/;
    for (const p of m.props) if (p && VEG.test(p.t) && Math.abs(p.x - MX) < 7 * TILE + Math.max(0, p.y - MY) * 0.25 && p.y > MY - 2 * TILE && p.y < MY + 26 * TILE) drop.add(p.x + ',' + p.y);
    if (m.addSolidProp) for (const dx of [-56, 56]) m.addSolidProp(MX + dx, MY - 6, 14);
    for (const [dx, dy, r] of [[R + 0.5, -3, 20], [R + 1.2, 1, 17], [R + 0.4, 4.5, 14]]) P('boulder', (BX + dx) * TILE, (BY + dy) * TILE, r, { s: r * 2 + 6, style: 'basalt' });
    // the cobble beach's things: the rowboat drawn up, barrels, driftwood logs; rocks and surf at the water's edge
    P('rowboat', (BX - 3) * TILE, (BY + 2.5) * TILE, 0, { a: -2.6 });
    P('barrel', MX + 70, MY + 40, 7); P('barrel', MX + 88, MY + 52, 7); P('barrels', MX + 120, MY + 30, 0, { a: 0 });
    for (const [dx, dy, a, ln] of [[1.5, 4, 0.4, 70], [-1, 6, 2.6, 56], [4, -1, 1.2, 48]]) P('driftwood', (BX + dx) * TILE, (BY + dy) * TILE, 0, { a, len: ln });
    for (let k = 0; k < 6; k++) { const ty = BY - 5 + k * 2, tx = best.sea + 1 + (k % 2); P('boulder', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12, { s: 26 + (k * 7) % 12, style: 'basalt', barn: 1 }); }
    P('lantern', MX - 54, MY + 18, 0);
    mouths.push({ name: 'the Sea Cave', kind: 'sea', x: MX, y: MY + 10, out: { x: MX, y: MY + 66 }, inside: { x: MX + 8, y: MY - 40 }, toward: 'seacave' });
    (m.landmarks ||= []).push({ name: 'Redwood Caverns (the sea cave)', type: 'cave', x: MX - 160, y: MY - 80, w: 320, h: (R + 4) * TILE });
    m.natureSites.push({ kind: 'cavemouth', name: 'Redwood Caverns', where: 'the Sea Cave, Redwood Cove', x: MX, y: MY + 10 });
    out.sea = [MX, MY];
  }
  if (drop.size && H3.removeProps) H3.removeProps(m, (x, y) => drop.has(x + ',' + y));
  for (const [t, x, y, r, ex] of props) H3.addProp(m, t, x, y, r, ex);
  // ---- 3. the plan underground (B1) ------------------------------------------------------------------------------------
  const plan = cavernPlan(CAVERNS, mouths);
  (m.caverns ||= []).push(plan);
  out.built = true;
  out.chambers = plan.chambers.length; out.docks = plan.docks.length; out.boats = plan.docks.filter((d) => d.boat).length; out.chests = plan.chests.length;
  return out;
}

// the network's plan in px (what shared/underground.js reads): the chambers, passages to the ones off the river, the
// river and its bank, the lake, the sea pool, the cascades and stairs, docks with their boats and lanterns, chests, the
// den's moss, the sea cave's cobbles and its smugglers' things, the roof seep in the gallery
export function cavernPlan(C, mouths) {
  const hw = Math.round(C.hw * TILE), bank = Math.round(C.bank * TILE);
  // the river's course: the line above, a point every 6 tiles, swung from side to side (slow waves, their length and
  // reach varying) - but not through the chambers it runs through, nor the lake: there it keeps to the line
  const line = C.river.map(([x, y]) => P2(x, y)), dense = [line[0]];
  for (let k = 1; k < line.length; k++) { const [ax, ay] = line[k - 1], [bx, by] = line[k], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (6 * TILE))); for (let j = 1; j <= n; j++) dense.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n]); }
  const still = C.chambers.filter((c) => c.on).map((c) => { const [x, y] = P2(c.at[0], c.at[1]); return [x, y, (c.r + 6) * TILE]; });
  const pts = [];
  let s0 = 0;
  for (let k = 0; k < dense.length; k++) {
    if (k) s0 += Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]);
    const a = dense[Math.max(0, k - 1)], b = dense[Math.min(dense.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    let fade = 1;
    for (const [x, y, r] of still) { const d = Math.hypot(dense[k][0] - x, dense[k][1] - y); fade = Math.min(fade, Math.max(0, Math.min(1, (d - r) / (14 * TILE)))); }
    const wv = C.wander.wave * TILE, sw = Math.sin(s0 / wv * 2 * Math.PI) * 0.7 + Math.sin(s0 / (wv * 0.43) * 2 * Math.PI + 1.3) * 0.3;
    const o = C.wander.a * TILE * sw * fade * fade * (3 - 2 * fade);
    pts.push([Math.round(dense[k][0] + nx * o), Math.round(dense[k][1] + ny * o)]);
  }
  // the river's points: along it (s px), its heading at a point and its normal (+: the right going downstream)
  const S = [0]; for (let k = 1; k < pts.length; k++) S.push(S[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const atX = (x) => { let bk = 0, bd = Infinity; for (let k = 0; k < pts.length - 1; k++) { const d = Math.abs((pts[k][0] + pts[k + 1][0]) / 2 - (x + 0.5) * TILE); if (d < bd) { bd = d; bk = k; } } const a = pts[bk], b = pts[bk + 1], t = Math.max(0, Math.min(1, ((x + 0.5) * TILE - a[0]) / ((b[0] - a[0]) || 1))); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / l, uy: (b[1] - a[1]) / l }; };
  const chambers = C.chambers.map((c) => { const [x, y] = P2(c.at[0], c.at[1]); return { id: c.id, name: c.name, x, y, r: Math.round(c.r * TILE), depth: c.depth, kind: c.kind, ...(c.glow ? { glow: c.glow } : {}), ...(c.ores ? { ores: c.ores } : {}) }; });
  const byId = Object.fromEntries(chambers.map((c) => [c.id, c]));
  // a point along the river s px from its head, its heading
  const along = (s) => { let k = 1; while (k < pts.length - 1 && S[k] < s) k++; const a = pts[k - 1], b = pts[k], l = (S[k] - S[k - 1]) || 1, t = Math.max(0, Math.min(1, (s - S[k - 1]) / l)); return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / l, uy: (b[1] - a[1]) / l }; };
  // the river's nearest point to (x, y): its distance down the river
  const sNear = (x, y) => { let bs = 0, bd = Infinity; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); if (d < bd) { bd = d; bs = S[k - 1] + Math.sqrt(l2) * t; } } return bs; };
  // the chambers off the river: a passage from each to the river's bank (its link point)
  const passages = [];
  // (to the river where it runs nearest - its course wanders: the bank there, on the chamber's side)
  for (const c of C.chambers) if (c.link) { const q = byId[c.id], r = along(sNear(q.x, q.y)), d = Math.hypot(q.x - r.x, q.y - r.y) || 1; passages.push([c.id, c.id, [[Math.round(r.x + (q.x - r.x) / d * (hw + 20)), Math.round(r.y + (q.y - r.y) / d * (hw + 20))]]]); }
  const [lx, ly] = P2(C.lake.at[0], C.lake.at[1]), lake = { x: lx, y: ly, r: Math.round(C.lake.r * TILE) };
  const [sx, sy] = P2(C.sea.at[0], C.sea.at[1]), sea = { x: sx, y: sy, r: Math.round(C.sea.r * TILE) };
  // the cascades, and the stairs beside each on the bank (the way round)
  const cascades = [], stairs = [];
  for (const cx of C.cascades) {
    const q = atX(cx), nx = -q.uy, ny = q.ux;
    cascades.push({ x: Math.round(q.x), y: Math.round(q.y), ux: Math.round(q.ux * 1000) / 1000, uy: Math.round(q.uy * 1000) / 1000, t: 26 });
    for (const sd of [-1, 1]) stairs.push({ x: Math.round(q.x + nx * sd * (hw + 40)), y: Math.round(q.y + ny * sd * (hw + 40)), ux: Math.round(q.ux * 1000) / 1000, uy: Math.round(q.uy * 1000) / 1000, len: 96 });
  }
  // the docks: a pier out from the bank, a lantern at its foot, a rowboat moored downstream of it (a lake's dock: on its
  // rim at an angle, the pier pointing to its middle)
  const docks = [], lanterns = [];
  for (const d of C.docks) {
    let bx, by, ix, iy, ux, uy;
    let boat = null;
    if (d.lake !== undefined) {   // (the lake's shore is ragged: the pier from well up the shore to well out, the boat further out)
      const a = d.lake, cx = Math.cos(a), cy = Math.sin(a);
      bx = lake.x + cx * lake.r * 1.14; by = lake.y + cy * lake.r * 1.14; ix = lake.x + cx * lake.r * 0.8; iy = lake.y + cy * lake.r * 0.8; ux = -cy; uy = cx;
      if (d.boat) boat = { x: Math.round(lake.x + cx * lake.r * 0.68 + ux * 50), y: Math.round(lake.y + cy * lake.r * 0.68 + uy * 50), a: Math.round(Math.atan2(uy, ux) * 1000) / 1000 };
    } else {
      const s0 = sNear(atX(d.x).x, atX(d.x).y), q = along(s0), nx = -q.uy * d.side, ny = q.ux * d.side;
      bx = q.x + nx * (hw + 34); by = q.y + ny * (hw + 34); ix = q.x + nx * (hw - 30); iy = q.y + ny * (hw - 30); ux = q.ux; uy = q.uy;
      if (d.boat) { const b = along(s0 + 92), bn = [-b.uy * d.side, b.ux * d.side]; boat = { x: Math.round(b.x + bn[0] * (hw - 36)), y: Math.round(b.y + bn[1] * (hw - 36)), a: Math.round(Math.atan2(b.uy, b.ux) * 1000) / 1000 }; }
    }
    const nx = (ix - bx) / (Math.hypot(ix - bx, iy - by) || 1), ny = (iy - by) / (Math.hypot(ix - bx, iy - by) || 1);
    docks.push({ x0: Math.round(bx), y0: Math.round(by), x1: Math.round(ix), y1: Math.round(iy), hw: 18, boat });
    lanterns.push({ x: Math.round(bx - ux * 26 - nx * 8), y: Math.round(by - uy * 26 - ny * 8) });
  }
  // lanterns by the ways in, in the treasure chamber and at the ore face; chests; the sea cave's smugglers' things and
  // the ore face's mining gear; the den's moss, the sea cave's cobbles; where the creek seeps in through the roof
  for (const M of mouths) lanterns.push({ x: M.inside.x + 30, y: M.inside.y - 10 });
  const T2 = byId.treasure, O2 = byId.ore, V2 = byId.crystal, SC = byId.seacave, D2 = byId.den, G2 = byId.gallery;
  lanterns.push({ x: T2.x - 90, y: T2.y - 40 }, { x: T2.x + 100, y: T2.y + 30 }, { x: O2.x + 60, y: O2.y + 70 }, { x: SC.x + 80, y: SC.y - 60 });
  const chests = [
    { x: T2.x - 40, y: T2.y - 70 }, { x: T2.x + 60, y: T2.y - 60 }, { x: T2.x + 10, y: T2.y + 80 },
    { x: V2.x - 120, y: V2.y - 50 }, { x: V2.x + 110, y: V2.y + 40 },
    { x: SC.x + 120, y: SC.y + 10 }, { x: O2.x - 100, y: O2.y + 40 },
  ];
  const things = [
    { t: 'barrel', x: SC.x + 140, y: SC.y - 40 }, { t: 'barrel', x: SC.x + 160, y: SC.y - 20 }, { t: 'barrel', x: SC.x + 128, y: SC.y + 46 }, { t: 'crate', x: SC.x + 70, y: SC.y + 90 }, { t: 'crate', x: SC.x + 100, y: SC.y + 104 },
    { t: 'cart', x: O2.x + 30, y: O2.y + 90 }, { t: 'pick', x: O2.x - 60, y: O2.y - 20 }, { t: 'shoring', x: O2.x, y: O2.y - 150 }, { t: 'shoring', x: O2.x - 140, y: O2.y - 40 },
    { t: 'gold', x: T2.x - 20, y: T2.y + 10 }, { t: 'gold', x: T2.x + 40, y: T2.y + 30 },
  ];
  const [gx, gy] = [pts[0][0], pts[0][1] - 24];   // (the creek in through the roof, into the river's head)
  void G2;
  return {
    name: C.name, key: C.key, title: C.title, mouths, chambers, passages,
    river: { pts, hw, bank, vary: 1, len: Math.round(S[S.length - 1]) }, lake, sea, cascades, stairs, docks, lanterns, chests, things,
    moss: [{ x: D2.x, y: D2.y, r: D2.r + 30 }], cobbles: [{ x: SC.x + 40, y: SC.y + 30, r: SC.r }], seep: { x: Math.round(gx), y: Math.round(gy) },
  };
}
