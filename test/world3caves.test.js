// The Redwood Caverns (the nature program, 2026-10-20: Nature-B1, the cave network, and Nature-B2, its ways in):
// shared/world3-caves.js lays them out (the ways in on the map, the plan underground: m.caverns), shared/underground.js
// carves and dresses them like a mine's cave, server/systems/underground.js runs them (their mouths, rowboats, chests),
// client/underground/view.js draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { undergroundOf, ugMapOf, cellAtPx, lightAt, mouthNear, wayOut, caveOf, UG, C } from '../shared/underground.js';
import { cavernPlan, CAVERNS } from '../shared/world3-caves.js';
import { TILE, T } from '../shared/constants.js';
import { CHEST_LOOT } from '../shared/rules.js';
import * as players from '../server/systems/players.js';

// a small network on a stand-in spot of the test world (clear of its sewers and its cave)
const SPEC = {
  name: 'the Test Caverns', key: 'test', title: 'Test Caverns',
  chambers: [
    { id: 'gallery', name: 'the Gallery', at: [380, 950], r: 8, depth: 1, kind: 'hall', on: 1 },
    { id: 'crystal', name: 'the Crystal Vault', at: [320, 915], r: 8, depth: 3, kind: 'crystal', glow: 'crystal', link: 1 },
    { id: 'lake', name: 'the Lake', at: [260, 950], r: 14, depth: 2, kind: 'lake', on: 1 },
    { id: 'den', name: 'the Den', at: [205, 985], r: 8, depth: 3, kind: 'den', link: 1 },
    { id: 'treasure', name: 'the Treasure Chamber', at: [165, 918], r: 8, depth: 3, kind: 'treasure', link: 1 },
    { id: 'ore', name: 'the Ore Face', at: [145, 985], r: 8, depth: 3, kind: 'ore', ores: ['goldOre', 'gem'], link: 1 },
    { id: 'seacave', name: 'the Sea Cave', at: [112, 950], r: 9, depth: 1, kind: 'sea', on: 1 },
  ],
  river: [[385, 950], [330, 952], [300, 950], [260, 950], [230, 952], [200, 955], [160, 952], [125, 950], [108, 950]],
  hw: 2, bank: 2.4, wander: { a: 4, wave: 40 }, lake: { at: [260, 950], r: 10 }, sea: { at: [102, 950], r: 4 },
  cascades: [300, 212],
  docks: [{ x: 362, side: -1, boat: 1 }, { x: 288, side: -1, boat: 1 }, { lake: 1.6, boat: 0 }, { x: 192, side: 1, boat: 1 }, { x: 128, side: -1, boat: 1 }],
};
const MOUTHS = [
  { name: 'the Falls', kind: 'falls', x: 395 * TILE, y: 958 * TILE, out: { x: 395 * TILE, y: 960 * TILE }, inside: { x: 392 * TILE, y: 955 * TILE }, toward: 'gallery' },
  { name: 'the Sea Cave', kind: 'sea', x: 108 * TILE, y: 963 * TILE, out: { x: 108 * TILE, y: 965 * TILE }, inside: { x: 109 * TILE, y: 960 * TILE }, toward: 'seacave' },
];
const walkable = (v) => v === C.FLOOR || v === C.DOCK;
// the cells reachable on foot from (x, y) (4-connected over floors and docks)
function onFoot(L, x, y) {
  const seen = new Set(), key = (tx, ty) => ty * 8192 + tx, q = [[Math.floor(x / TILE), Math.floor(y / TILE)]];
  seen.add(key(q[0][0], q[0][1]));
  while (q.length) {
    const [tx, ty] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + dx, ny = ty + dy, k = key(nx, ny); if (seen.has(k) || !walkable(cellAtPx(L, (nx + 0.5) * TILE, (ny + 0.5) * TILE))) continue; seen.add(k); q.push([nx, ny]); }
  }
  return (px, py) => seen.has(key(Math.floor(px / TILE), Math.floor(py / TILE)));
}
const chamberReached = (ok, c) => { for (let r = 0; r <= c.r; r += 16) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (ok(c.x + dx, c.y + dy)) return true; return false; };

test('a cavern underground: its chambers joined from both ways in, the river cut by its cascades, docks, boats on the water, chests, lanterns', () => {
  const plan = cavernPlan(SPEC, MOUTHS);
  const map = { seed: 1337, x0: 0, y0: 0, w: 1312, h: 1200, frame: { w: 1312, h: 1200 }, natureSites: [], caverns: [plan] };
  const L = undergroundOf(map), K = L.caves[0], P = ugMapOf(map);
  assert.ok(K && K.kind === 'cavern' && K.mouths.length === 2 && K.name === SPEC.name);
  for (const M of K.mouths) {
    const ok = onFoot(L, M.inside.x, M.inside.y);
    for (const c of K.chambers) assert.ok(chamberReached(ok, c), `${c.name} reached on foot from ${M.name}`);
    for (const c of K.chests) assert.ok(ok(c.x, c.y), `chest ${c.i} reached from ${M.name}`);
    const other = K.mouths.find((q) => q !== M);
    assert.ok(ok(other.inside.x, other.inside.y), 'through from one way in to the other on foot');
  }
  // the river: water down its course, a wall of white water across it at each cascade (boats and swimmers stop there)
  assert.equal(K.cascades.length, SPEC.cascades.length);
  for (const q of K.cascades) assert.equal(P.tileAtPx(q.x, q.y), T.WALL, 'a cascade: nobody through');
  let cells = 0; for (const v of K.region.c) if (v === C.CASCADE) cells++;
  assert.ok(cells >= 4, `the cascades' cells (${cells})`);
  // docks: planks out over the water (walked on, the boats beside them), a lantern at each
  assert.equal(K.docks.length, SPEC.docks.length);
  for (const d of K.docks) {
    assert.equal(P.tileAtPx(d.x1, d.y1), T.DOCK, 'the end of the pier');
    let wet = 0; for (let a = 0; a < 8; a++) { const v = cellAtPx(L, d.x1 + Math.cos(a * 0.785) * 40, d.y1 + Math.sin(a * 0.785) * 40); if (v === C.RIVER) wet++; }
    assert.ok(wet >= 2, 'out over the water');
  }
  // a rowboat at each dock that keeps one, afloat its whole length
  assert.equal(K.boats.length, SPEC.docks.filter((d) => d.boat).length);
  for (const b of K.boats) for (const d of [-30, 0, 30]) assert.equal(cellAtPx(L, b.x + d * Math.cos(b.a), b.y + d * Math.sin(b.a)), C.RIVER, `boat ${b.i} afloat`);
  // the reaches: a boat can't get from one side of a cascade to the other (each cascade parts the boats)
  const afloat = (b) => { const seen = new Set(), key = (tx, ty) => ty * 8192 + tx, q = [[Math.floor(b.x / TILE), Math.floor(b.y / TILE)]]; while (q.length) { const [tx, ty] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + dx, ny = ty + dy, k = key(nx, ny); if (seen.has(k) || cellAtPx(L, (nx + 0.5) * TILE, (ny + 0.5) * TILE) !== C.RIVER) continue; seen.add(k); q.push([nx, ny]); } } return seen; };
  const reaches = new Set(K.boats.map((b) => [...afloat(b)].sort((a, c) => a - c)[0]));
  assert.equal(reaches.size, SPEC.cascades.length + 1, 'the river in reaches between its cascades');
  // chests on the floor; the glowing things and the lanterns light it (and nothing else does)
  assert.ok(K.chests.length >= 7 && K.chests.every((c) => cellAtPx(L, c.x, c.y) === C.FLOOR), 'the chests on the floor');
  const l0 = K.lanterns[0];
  assert.ok(lightAt(L, l0.x, l0.y) > 0.5, 'by a lantern: light');
  assert.ok(K.glow.some((g) => g.kind === 'crystal') && K.glow.some((g) => g.kind === 'worms') && K.glow.some((g) => g.kind === 'mush'), 'crystals, glow-worms, mushrooms');
  assert.ok(K.moss.length && K.cobbles.length && K.den && K.roosts.length, 'the den\'s moss, the sea cave\'s cobbles, the bear\'s den, the bats');
  // the ore face's veins: its own ores
  const face = L.veins.filter((v) => v.where.startsWith('the Ore Face'));
  assert.ok(face.length >= 4 && face.every((v) => SPEC.chambers.find((c) => c.id === 'ore').ores.includes(v.ore)), `the ore face (${face.map((v) => v.ore)})`);
  // the ways in: the nearest mouth, the nearest way out
  assert.equal(mouthNear(L, MOUTHS[1].x + 10, MOUTHS[1].y).M.name, 'the Sea Cave');
  assert.equal(wayOut(K, MOUTHS[1].inside.x + 20, MOUTHS[1].inside.y).M.name, 'the Sea Cave');
  assert.equal(wayOut(K, MOUTHS[0].inside.x, MOUTHS[0].inside.y - 30).M.name, 'the Falls');
  assert.equal(caveOf(L, K.ch.den.x, K.ch.den.y), K);
});

test('the server: in by one way, the rowboats waiting, a chest opened once, out by the other', () => {
  const w = makeWorld();
  w.map.caverns = [cavernPlan(SPEC, MOUTHS)];
  const L = undergroundOf(w.map), K = L.caves.find((q) => q.kind === 'cavern');
  assert.ok(K, 'the cavern in the world\'s underground');
  const { p, prof } = joinPlayer(w);
  teleport(w, p.ped, MOUTHS[0].x + 6, MOUTHS[0].y + 4);
  const a = players.findInteraction(w, p);
  assert.ok(a && /Go into the Test Caverns/.test(a.label), `the way in (${a && a.label})`);
  a.run();
  assert.equal(p.ped.ug, UG.CAVE);
  assert.ok(Math.hypot(p.ped.x - MOUTHS[0].inside.x, p.ped.y - MOUTHS[0].inside.y) < 4, 'in at that mouth');
  run(w, 0.5);
  const boats = [...w.entities.values()].filter((v) => v.model === 'rowboat');
  assert.equal(boats.length, K.boats.length, 'a rowboat at each dock that keeps one');
  assert.ok(boats.every((v) => v.ug === UG.CAVE && v.sub), 'down here');
  // a chest: something in it, once
  const c = K.chests[0];
  teleport(w, p.ped, c.x + 20, c.y);
  const before = { cash: prof.cash, d: prof.inventory.doubloon || 0 };
  const o = players.findInteraction(w, p);
  assert.ok(o && /Open the old chest/.test(o.label), `the chest (${o && o.label})`);
  o.run();
  const gained = prof.cash - before.cash;
  assert.ok(gained >= CHEST_LOOT.cash[0] && gained <= CHEST_LOOT.cash[1], `old coins: $${gained}`);
  assert.ok((prof.inventory.doubloon || 0) > before.d, 'doubloons');
  assert.ok(/empty/i.test(players.findInteraction(w, p).label), 'empty after');
  // out by the sea cave
  teleport(w, p.ped, MOUTHS[1].inside.x, MOUTHS[1].inside.y);
  const out = players.findInteraction(w, p);
  assert.ok(out && /sea cave/i.test(out.label), `the way out (${out && out.label})`);
  out.run();
  assert.equal(p.ped.ug, 0);
  assert.ok(Math.hypot(p.ped.x - MOUTHS[1].out.x, p.ped.y - MOUTHS[1].out.y) < 4, 'out on the beach');
  run(w, 0.5);
  assert.equal([...w.entities.values()].filter((v) => v.model === 'rowboat' && !v.removed).length, 0, 'nobody down there: the boats put away');
});

test('World v3: the Redwood Caverns - in behind Redwood Creek Falls, out at the sea cave on Redwood Cove, the network between', { timeout: 400000 }, async () => {
  const { generateCity } = await import('../shared/map.js');
  await import('../shared/world3-islands.js');
  const { FRAME_W, FRAME_H } = await import('../shared/world3.js');
  const { prepare } = await import('../tools/world3-build.mjs');
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const B = m.world3.caves;
  assert.ok(B && B.built && B.missed.length === 0, `built (${B && B.missed.join('; ')})`);
  const plan = m.caverns.find((q) => q.key === 'redwood');
  assert.ok(plan && plan.mouths.length === 2 && plan.chambers.length === CAVERNS.chambers.length);
  // the ways in: beside the falls, at the back of the cove's cobble beach - each a mouth in the rock, a lantern by it,
  // where you come out on open ground (nothing solid there)
  const creek = m.natureSites.find((s) => s.kind === 'creek' && s.name === 'Redwood Creek'), cove = m.natureSites.find((s) => s.kind === 'redwoodcove');
  const [MF, MS] = plan.mouths;
  assert.ok(MF.kind === 'falls' && Math.hypot(MF.x - creek.falls.x, MF.y - creek.falls.y) < 320, 'by the falls');
  assert.ok(MS.kind === 'sea' && Math.hypot(MS.x - cove.x, MS.y - cove.y) < 1000, 'at Redwood Cove');
  const near = (t, x, y, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - x, p.y - y) < r).length;
  for (const M of plan.mouths) {
    assert.equal(near('cavemouth', M.x, M.y, 60), 1, `${M.name}: its mouth`);
    assert.ok(near('lantern', M.x, M.y, 120) >= 1, `${M.name}: a lantern`);
    const tx = Math.floor(M.out.x / TILE), ty = Math.floor(M.out.y / TILE), t = m.tiles[m.idx(tx, ty)];
    assert.ok(t !== T.WALL && t !== T.WATER && t !== T.DEEP && t !== T.BUILDING, `${M.name}: out onto open ground (tile ${t})`);
    let solid = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const e of m.solidProps.get(m.idx(tx + dx, ty + dy)) || []) if (Math.hypot(e.x - M.out.x, e.y - M.out.y) < e.r + 10) solid++;
    assert.equal(solid, 0, `${M.name}: nothing solid where you come out`);
  }
  assert.ok(near('stairs', MF.x, MF.y, 200) >= 1 && near('rail', MF.x, MF.y, 300) >= 1, 'the falls: the stairs and the rail');
  assert.ok(near('cliffwall', MS.x, MS.y, 700) >= 3 && near('rowboat', MS.x, MS.y, 500) === 1 && near('barrel', MS.x, MS.y, 300) >= 2, 'the sea cave: the basalt cliff, the rowboat on the cobbles, barrels');
  let cobbles = 0;
  for (let ty = Math.floor(MS.y / TILE) - 2; ty <= Math.floor(MS.y / TILE) + 16; ty++) for (let tx = Math.floor(MS.x / TILE) - 12; tx <= Math.floor(MS.x / TILE) + 12; tx++) { const i = m.idx(tx, ty); if (m.tiles[i] === T.SAND && m.reserve[i] & 128) cobbles++; }
  assert.ok(cobbles >= 60, `the cobble beach (${cobbles} tiles)`);
  assert.equal(m.natureSites.filter((s) => s.kind === 'cavemouth').length, 2, 'both ways in on the map');
  // underground: its own region, apart from the mines' caves and the sewers; every chamber from both ways in; five
  // rowboats afloat; the two cascades; the chests; the ore face's gold and amethyst
  const L = undergroundOf(m), K = L.caves.find((q) => q.kind === 'cavern');
  for (const R of L.regions) if (R !== K.region) assert.ok(K.region.x0 + K.region.w < R.x0 || R.x0 + R.w < K.region.x0 || K.region.y0 + K.region.h < R.y0 || R.y0 + R.h < K.region.y0, 'apart from the other regions');
  for (const M of K.mouths) { const ok = onFoot(L, M.inside.x, M.inside.y); for (const c of K.chambers) assert.ok(chamberReached(ok, c), `${c.name} from ${M.name}`); }
  assert.equal(K.boats.length, 5);
  for (const b of K.boats) for (const d of [-30, 0, 30]) assert.equal(cellAtPx(L, b.x + d * Math.cos(b.a), b.y + d * Math.sin(b.a)), C.RIVER, `boat ${b.i} afloat`);
  assert.equal(K.cascades.length, 2);
  assert.ok(K.chests.length >= 7 && K.chests.every((c) => cellAtPx(L, c.x, c.y) === C.FLOOR), 'the chests');
  const face = L.veins.filter((v) => v.where.startsWith('the Ore Face'));
  assert.ok(face.length >= 4 && face.some((v) => v.ore === 'gem') && face.some((v) => v.ore === 'goldOre'), `the ore face (${face.map((v) => v.ore)})`);
  assert.ok(plan.river.len > 30000, `about a kilometre of river (${plan.river.len} px)`);
});
