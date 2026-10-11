// World v3, stage 2, step 2 (docs/WORLD-V3.md 8.4): an island built at its gulf place. Step A, the proof: Metro City +
// Southbank (with Pelican Key: the island build of 4.7) built at its v3 position at today's size - every position the
// build takes from today's world placed by at + (p - from) * scale, position seeds and hashes read back in today's
// coordinates - comes out as the island built in today's frame, moved by the offset. (About 7 s: two builds; the
// frame here is just big enough to hold the place - the v3 frame's is tools/world3-place.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { ISLANDS } from '../shared/world3-skeleton.js';
import { comparePlaced } from '../tools/world3-place.mjs';

test('Metro City built at its gulf place, at scale 1, is the island build moved', () => {
  const pic = ISLANDS.find((I) => I.key === 'metro').picture;
  const ref = generateCity(1337, { island: 'metro' });
  const placed = generateCity(1337, { island: 'metro', frame: { w: 2500, h: 2800 }, place: { at: pic.at, scale: 1, from: pic.from } });
  assert.equal(placed.w, 2500);
  const r = comparePlaced(ref, placed, pic.at[0] - pic.from[0], pic.at[1] - pic.from[1]);
  // its land, districts, zones, the river and the sea's distance: to the tile
  for (const k of ['land', 'dist', 'zone', 'river', 'distSea', 'roadRank']) assert.equal(r.layers[k], 0, `${k}: ${r.layers[k]} tiles differ`);
  assert.equal(r.extraLand, 0);
  // the streets to the edge; the rest as the island builds match today's (4.7: Pelican Key's beach end and a few props
  // drawn from the shared random stream differ)
  assert.equal(r.roads.same, r.roads.today, `road edges ${r.roads.same} of ${r.roads.today}: ${r.roads.missing.join(' ; ')}`);
  assert.ok(r.landTiles - r.layers.tiles >= 0.995 * r.landTiles, `tiles ${r.landTiles - r.layers.tiles} of ${r.landTiles}`);
  assert.ok(r.buildings.same >= 0.97 * r.buildings.today, `buildings ${r.buildings.same} of ${r.buildings.today}`);
  assert.ok(r.pois.same >= 0.95 * r.pois.today, `POIs ${r.pois.same} of ${r.pois.today}`);
  assert.ok(r.props.same >= 0.9 * r.props.today, `props ${r.props.same} of ${r.props.today}`);
});

// Step B's crossings (H21, docs/WORLD-V3.md 8.4): Metro City + Southbank at its gulf place and size on the v3 land -
// the canal splits it into two landmasses and the bridges join them: the avenues' own (Bridge and Northbridge Avenues,
// over the inlet and the canal) and the skeleton's canal bridges; the roads that ran off it over the sea end at its
// shore; the railway isn't the island's. (About 20 s: today's world, the v3 land, the place.)
test('Metro City + Southbank on the v3 land: one road network, joined by the canal\'s bridges, no road over open water', async () => {
  const { buildLand3 } = await import('../shared/world3-land.js');
  const { TILE } = await import('../shared/constants.js');
  let world = generateCity(1337);
  const L = buildLand3(world);
  world = null;
  const pic = ISLANDS.find((I) => I.key === 'metro').picture;
  const m = generateCity(1337, { island: 'metro', frame: { w: L.w, h: L.h }, place: { at: pic.at, scale: pic.scale, from: pic.from }, land: L });
  const W = m.w, tileOf = (x, y) => Math.floor(y / TILE) * W + Math.floor(x / TILE);
  // the graph: one network (the canal's two landmasses joined by their bridges)
  const comp = new Int32Array(m.nodes.length).fill(-1);
  let pieces = 0;
  for (const n of m.nodes) {
    if (comp[n.id] >= 0) continue;
    const st = [n.id]; comp[n.id] = pieces;
    while (st.length) { const a = st.pop(); for (const id of m.nodes[a].edges) for (const b of [m.edges[id].a, m.edges[id].b]) if (comp[b] < 0) { comp[b] = pieces; st.push(b); } }
    pieces++;
  }
  assert.equal(pieces, 1, `the road graph is ${pieces} pieces`);
  // the bridges over the canal (the land layer's canal water), and what they join: a junction on either landmass
  const sample = (e, f) => { for (let k = 0; k + 1 < e.pts.length; k++) { const a = e.pts[k], b = e.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16)); for (let j = 0; j <= n; j++) f(tileOf(a.x + (b.x - a.x) * j / n, a.y + (b.y - a.y) * j / n)); } };
  const overCanal = new Set();
  for (const e of m.edges) { let c = false; sample(e, (i) => { if (L.layers.water[i] === 5) c = true; }); if (c && e.lvl === 0) overCanal.add(e.name); }
  for (const name of ['Bridge Avenue', 'Northbridge Avenue', 'Canal Bridge 1', 'Canal Bridge 4', 'Canal Footbridge 5', 'Canal Bridge 6']) assert.ok(overCanal.has(name), `${name} crosses the canal (${[...overCanal].join(', ')})`);
  const cr = m.islandBuild.crossings;
  assert.deepEqual(cr.carried.map((s) => s.split(' (')[0]).sort(), ['Canal Bridge 3', 'Canal Footbridge 2'], 'the two the avenues carry');
  // no road over open water but on a bridge, and no road ends in the water
  for (const e of m.edges) {
    if (e.lvl !== 0) continue;
    let wet = 0; sample(e, (i) => { if (!m.land[i]) wet++; });
    assert.ok(!wet || e.bridge, `${e.name || e.kind} runs over the water off a bridge`);
  }
  for (const n of m.nodes) if (n.lvl === 0 && n.edges.length === 1) assert.ok(m.land[tileOf(n.x, n.y)], `${m.edges[n.edges[0]].name} ends in the water at ${Math.round(n.x / TILE)}, ${Math.round(n.y / TILE)}`);
  // the roads off the place over the sea: gone or cut at the shore (the Bay Bridge, Cedar Avenue's bridge, the Desert
  // Highway); the railway left out, and listed
  for (const e of m.edges) assert.ok(!['Bay Bridge', 'Cedar Bridge'].includes(e.name), `${e.name} is laid`);
  assert.ok(!m.edges.some((e) => e.kind === 'hwy' && e.lvl === 0), 'a highway on the ground (a bridge off the place)');
  assert.equal(m.rail.pts.length, 0);
  assert.ok(m.islandBuild.leftOut.some((l) => l.kind === 'rail'));
  // the skeleton's crossings to the other places that meet this one are listed
  for (const name of ['Union Bridge', 'Eastgate Bridge', 'Southbank Walk', 'Northshore Lift Bridge']) assert.ok(cr.crossings.some((c) => c.name === name), `${name} listed`);
  // the canal is one water: no wedge of it cut off (a river tile apart from its body)
  const seen = new Uint8Array(W * m.h);
  let bodies = 0;
  for (let i = 0; i < W * m.h; i++) {
    if (!m.river[i] || m.lake[i] || seen[i]) continue;
    bodies++; const st = [i]; seen[i] = 1;
    while (st.length) { const j = st.pop(); for (const k of [j - 1, j + 1, j - W, j + W]) if (m.river[k] && !m.lake[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
  }
  assert.equal(bodies, 1, `the canal's water is ${bodies} pieces`);
});

test.todo('Metro City + Southbank on the v3 land: its blocks at today\'s size (metro.js\'s anchors placed, its pitches unscaled: WORLD-V3.md 8.4)');
