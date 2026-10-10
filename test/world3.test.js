// World v3 (docs/WORLD-V3.md part 4): the frame and its regions (shared/world3.js), and stage 1's first spike - Metro
// City generated alone and placed in its v3 rectangle (tools/world3-spike.mjs) - while today's world stays as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHUNK_TILES } from '../shared/constants.js';
import {
  REGION_TILES, REGION_CHUNKS, REGIONS_X, REGIONS_Y, REGION_COUNT, FRAME_W, FRAME_H, FRAME_CHUNKS_X, FRAME_CHUNKS_Y,
  inFrame, regionIndex, regionXY, regionKey, regionAt, regionBounds, localIndex, chunkRegion, regionsInRect, regionsAround,
  regionSeed, PLACEMENTS, placedRect, placedRegions, toFrame, fromFrame, cutRegion, placementsIn, placementsAround,
} from '../shared/world3.js';

test('the v3 frame: 5040 x 4032 tiles, 10 x 8 regions of 504, each a whole number of net chunks', () => {
  assert.equal(REGION_TILES, 504);
  assert.equal(REGION_TILES % CHUNK_TILES, 0);
  assert.equal(REGION_CHUNKS * CHUNK_TILES, REGION_TILES);
  assert.deepEqual([FRAME_W, FRAME_H, REGIONS_X, REGIONS_Y, REGION_COUNT], [5040, 4032, 10, 8, 80]);
  assert.deepEqual([FRAME_CHUNKS_X, FRAME_CHUNKS_Y], [210, 168]);
  assert.ok(inFrame(0, 0) && inFrame(FRAME_W - 1, FRAME_H - 1) && !inFrame(-1, 0) && !inFrame(FRAME_W, 0) && !inFrame(0, FRAME_H));
});

test('regions: index, column and row, bounds, the region of a tile, a tile\'s index inside its region', () => {
  const seenKeys = new Set();
  for (let ri = 0; ri < REGION_COUNT; ri++) {
    const { rx, ry } = regionXY(ri);
    assert.equal(regionIndex(rx, ry), ri);
    seenKeys.add(regionKey(ri));
    const [x0, y0, x1, y1] = regionBounds(ri);
    assert.equal(x1 - x0, REGION_TILES); assert.equal(y1 - y0, REGION_TILES);
    for (const [x, y] of [[x0, y0], [x1 - 1, y0], [x0, y1 - 1], [x1 - 1, y1 - 1], [(x0 + x1) >> 1, (y0 + y1) >> 1]]) {
      assert.equal(regionAt(x, y), ri, `tile ${x},${y}`);
      const li = localIndex(ri, x, y);
      assert.ok(li >= 0 && li < REGION_TILES * REGION_TILES);
    }
    assert.equal(localIndex(ri, x0, y0), 0);
    assert.equal(localIndex(ri, x1 - 1, y1 - 1), REGION_TILES * REGION_TILES - 1);
    assert.equal(localIndex(ri, x0 + 3, y0 + 2), 2 * REGION_TILES + 3);
  }
  assert.equal(seenKeys.size, REGION_COUNT);
  assert.equal(regionKey(regionIndex(3, 5)), 'r3-5');
  for (const [x, y] of [[-1, 0], [0, -1], [FRAME_W, 5], [5, FRAME_H], [-504, -504]]) assert.equal(regionAt(x, y), -1);
  for (const [rx, ry] of [[-1, 0], [0, -1], [REGIONS_X, 0], [0, REGIONS_Y]]) assert.equal(regionIndex(rx, ry), -1);
  // the regions tile the frame: every tile in exactly one (sampled on a prime step)
  const count = new Uint32Array(REGION_COUNT);
  let n = 0;
  for (let y = 0; y < FRAME_H; y += 37) for (let x = 0; x < FRAME_W; x += 41) { count[regionAt(x, y)]++; n++; }
  assert.equal(count.reduce((a, b) => a + b, 0), n);
  assert.ok(count.every((c) => c > 0));
});

test('regions: a net chunk lies in exactly one region; rectangles and the 3 x 3 window', () => {
  for (let cy = 0; cy < FRAME_CHUNKS_Y; cy += 5) for (let cx = 0; cx < FRAME_CHUNKS_X; cx += 3) {
    const ri = chunkRegion(cx, cy), x = cx * CHUNK_TILES, y = cy * CHUNK_TILES;
    assert.equal(ri, regionAt(x, y));
    assert.equal(ri, regionAt(x + CHUNK_TILES - 1, y + CHUNK_TILES - 1), `chunk ${cx},${cy} straddles a border`);
  }
  assert.equal(chunkRegion(-1, 0), -1);
  assert.equal(regionsInRect(0, 0, FRAME_W, FRAME_H).length, REGION_COUNT);
  assert.deepEqual(regionsInRect(10, 10, 11, 11), [0]);
  assert.deepEqual(regionsInRect(500, 10, 510, 20), [0, 1]);                      // across a border
  assert.deepEqual(regionsInRect(-100, -100, 10, 10), [0]);                       // clipped to the frame
  assert.deepEqual(regionsInRect(503, 503, 505, 505), [0, 1, REGIONS_X, REGIONS_X + 1]);
  assert.equal(regionsAround(2600, 2600).length, 9);                              // inside
  assert.equal(regionsAround(5, 5).length, 4);                                    // a corner
  assert.equal(regionsAround(2600, 5).length, 6);                                 // an edge
  assert.ok(regionsAround(2600, 2600).includes(regionAt(2600, 2600)));
  assert.deepEqual(regionsAround(-5, 5), []);
  assert.equal(regionsAround(2600, 2600, 2).length, 25);
});

test('a region\'s seed: from the world\'s seed and the region alone, distinct, never 0, the same in every engine', () => {
  const seeds = Array.from({ length: REGION_COUNT }, (_, ri) => regionSeed(1337, ri));
  assert.equal(new Set(seeds).size, REGION_COUNT);
  for (const s of seeds) assert.ok(Number.isInteger(s) && s > 0 && s <= 0xffffffff);
  assert.deepEqual(seeds, Array.from({ length: REGION_COUNT }, (_, ri) => regionSeed(1337, ri)));   // no hidden state
  assert.notEqual(regionSeed(1338, 0), regionSeed(1337, 0));
  // pinned: integer arithmetic only, so these never change between engines or runs (and any change to the mixing would
  // regenerate every region's land - it must be on purpose)
  assert.equal(regionSeed(1337, 0), PIN[0]);
  assert.equal(regionSeed(1337, 79), PIN[1]);
  assert.equal(regionSeed(0, 0), PIN[2]);
  // its bits look random: each of the 32 bits set in roughly half the seeds of 4000 world seeds x 80 regions
  const ones = new Uint32Array(32);
  let N = 0;
  for (let w = 0; w < 4000; w++) for (let ri = 0; ri < REGION_COUNT; ri++) { const s = regionSeed(w * 7919 + 1, ri); N++; for (let b = 0; b < 32; b++) ones[b] += (s >>> b) & 1; }
  for (let b = 0; b < 32; b++) assert.ok(Math.abs(ones[b] / N - 0.5) < 0.01, `bit ${b}: ${ones[b] / N}`);
});
const PIN = [888795408, 2667422675, 3298878556];

test('the placements: every island\'s v3 rectangle inside the frame; the offset there and back; one region\'s grid cut from today\'s frame', () => {
  for (const [k, p] of Object.entries(PLACEMENTS)) {
    const [x0, y0, x1, y1] = placedRect(p);
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= FRAME_W && y1 <= FRAME_H, `${k} outside the frame: ${[x0, y0, x1, y1]}`);
    assert.ok(placedRegions(p).length >= 1);
    const [fx, fy] = toFrame(p, p.from[0], p.from[1]);
    assert.deepEqual(fromFrame(p, fx, fy), [p.from[0], p.from[1]]);
  }
  // Metro City: 504 tiles wide - exactly one region's width - but placed across two columns and two rows of regions
  const M = PLACEMENTS.metro;
  assert.equal(M.from[2] - M.from[0], REGION_TILES);
  assert.deepEqual(placedRect(M), [2133, 2030, 2637, 2677]);
  assert.deepEqual(placedRegions(M).map(regionKey), ['r4-4', 'r5-4', 'r4-5', 'r5-5']);
  // cutRegion on a made-up layer in today's frame: every value lands at its tile + the offset, the rest is the fill
  const W = 1312, H = 1200, layer = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) layer[y * W + x] = ((x * 7 + y * 13) % 65000) + 1;
  for (const ri of placedRegions(M)) {
    const g = cutRegion(layer, W, H, M, ri, 0);
    const [rx0, ry0] = regionBounds(ri);
    let inside = 0;
    for (let ly = 0; ly < REGION_TILES; ly += 3) for (let lx = 0; lx < REGION_TILES; lx += 3) {
      const [sx, sy] = fromFrame(M, rx0 + lx, ry0 + ly);
      const want = sx >= M.from[0] && sx < M.from[2] && sy >= M.from[1] && sy < M.from[3] ? layer[sy * W + sx] : 0;
      assert.equal(g[ly * REGION_TILES + lx], want);
      if (want) inside++;
    }
    assert.ok(inside > 0);
  }
  // a keep mask leaves what it rejects as the fill
  const g = cutRegion(layer, W, H, M, placedRegions(M)[3], 9, (i) => (i & 1) === 0, Uint32Array);
  assert.ok(g instanceof Uint32Array && g.includes(9));
});

test('what has to be built for a region, and for the window round a tile', () => {
  // every placed piece is listed by each region it touches, and only by those
  for (let ri = 0; ri < REGION_COUNT; ri++) for (const k of placementsIn(ri)) assert.ok(placedRegions(PLACEMENTS[k]).includes(ri), `${k} in ${regionKey(ri)}`);
  for (const [k, p] of Object.entries(PLACEMENTS)) for (const ri of placedRegions(p)) assert.ok(placementsIn(ri).includes(k));
  assert.deepEqual(placementsIn(regionIndex(9, 0)), []);   // the far north-east corner: new land only
  // the window round downtown needs five of today's pieces built (docs/WORLD-V3.md 4.6)
  const [x0, y0, x1, y1] = placedRect(PLACEMENTS.metro);
  assert.deepEqual(placementsAround((x0 + x1) >> 1, (y0 + y1) >> 1), ['metro', 'westport', 'airport', 'cedar', 'northshore']);
  assert.deepEqual(placementsAround(-1, -1), []);
});

// --- the spike (heavy: three world builds in a child process; `flock /tmp/cla-heavy.lock node --test test/world3.test.js`)
const SPIKE = fileURLToPath(new URL('../tools/world3-spike.mjs', import.meta.url));
const runSpike = (...args) => new Promise((res, rej) => execFile(process.execPath, ['--expose-gc', SPIKE, '--json', ...args], { maxBuffer: 1 << 22, timeout: 900000 }, (e, out) => (e ? rej(e) : res(JSON.parse(out)))));

test('the spike: Metro City generated alone, placed in its v3 rectangle; today\'s world still the stamped one', { timeout: 900000 }, async () => {
  const r = await runSpike('--twice');
  // today's world: the generator's new parameter, left out, changes nothing (the stamp in version.json is the live world)
  assert.equal(r.today.error, null);
  assert.equal(r.today.hash, r.today.stamped, 'generateCity(1337) is no longer the stamped world');
  // the spike builds, and builds the same twice
  assert.equal(r.spike.error, null, r.spike.error);
  assert.equal(r.deterministic, true);
  assert.equal(r.frame.frameOk, true);
  assert.deepEqual(r.frame.regions, ['r4-4', 'r5-4', 'r4-5', 'r5-5']);
  SPIKE_BASELINE(r);
});
test('the spike without the seam: with Dry Creek still joined on (and only its own roads laid), Metro City\'s streets are today\'s exactly', { timeout: 900000 }, async () => {
  // what is left once the cut at x = 1045 is taken away is what the other islands' absence does (world-wide ids and
  // numbering, the shared random stream): the streets don't depend on it at all
  const r = await runSpike('--with-drycreek', '--own-roads');
  assert.ok(r.roads.droppedLines > 0);   // (and the other islands' own roads, laid over what is now sea, left out: nothing changes)
  assert.equal(r.spike.error, null, r.spike.error);
  assert.equal(r.today.hash, r.today.stamped);
  assert.equal(r.roads.same, r.roads.today, JSON.stringify(r.roads));
  assert.equal(r.roads.onlySpike, 0);
  for (const k of ['dist', 'zone', 'river', 'deck', 'lvl0Block', 'distSea', 'distRiver']) assert.deepEqual(r.tiles.layers[k], { land: 0, water: 0 }, k);
  assert.ok(r.frame.same / r.frame.islandTiles >= 0.99, `tiles the same: ${r.frame.same} of ${r.frame.islandTiles}`);
  assert.ok(r.buildings.same / r.buildings.today >= 0.95, JSON.stringify(r.buildings));
  assert.ok(r.props.same / r.props.today >= 0.98, JSON.stringify(r.props));
});
// What the spike measured (docs/WORLD-V3.md 4.6): kept as a floor, so the work towards generating an island alone
// only ever brings it closer to today's.
function SPIKE_BASELINE(r) {
  assert.ok(r.frame.islandTiles > 150000, `island tiles ${r.frame.islandTiles}`);
  assert.ok(r.frame.same / r.frame.islandTiles >= SPIKE_FLOOR.tiles, `tiles the same: ${r.frame.same} of ${r.frame.islandTiles}`);
  assert.ok(r.roads.same / r.roads.today >= SPIKE_FLOOR.roads, `roads the same: ${r.roads.same} of ${r.roads.today}`);
  assert.ok(r.buildings.same / r.buildings.today >= SPIKE_FLOOR.buildings, `buildings the same: ${r.buildings.same} of ${r.buildings.today}`);
  assert.ok(r.pois.same / r.pois.today >= SPIKE_FLOOR.pois, `POIs the same: ${r.pois.same} of ${r.pois.today}`);
}
// (measured 2026-10-10: 95.3% of the island's land tiles, 95.7% of its road edges, 79.8% of its buildings, 49.8% of its
// POIs - by kind, place and name - came out as today's)
const SPIKE_FLOOR = { tiles: 0.95, roads: 0.95, buildings: 0.78, pois: 0.48 };

// --- island builds (docs/WORLD-V3.md 4.7): generateCity(seed, { island }) builds one piece of part 2's table alone.
// Coral Cay is the cheapest that has everything (streets, buildings, POIs, nature): about 1.5 s alone, plus today's
// world to compare with (in a child process, as the spike: tools/world3-islands.mjs).
const ISLANDS_TOOL = fileURLToPath(new URL('../tools/world3-islands.mjs', import.meta.url));
const runIslands = (...args) => new Promise((res, rej) => execFile(process.execPath, ['--expose-gc', ISLANDS_TOOL, '--json', ...args], { maxBuffer: 1 << 22, timeout: 900000 }, (e, out) => (e ? rej(e) : res(JSON.parse(out)))));

test('an island built alone (Coral Cay) is today\'s on its own land; built again it is the same; today\'s world still the stamped one', { timeout: 900000 }, async () => {
  const r = await runIslands('--island', 'coral', '--twice');
  assert.equal(r.today.hash, r.today.stamped, 'generateCity(1337) is no longer the stamped world');
  const c = r.islands.coral;
  assert.equal(c.error, null, c.error);
  assert.equal(r.twice.same, true, 'two builds of the island differ');
  // all of it: an island with no seam and no bridge (nothing left out), so all its land is "away from its seams"
  assert.ok(c.landTiles > 12000, `land ${c.landTiles}`);
  assert.equal(c.awayTiles, c.landTiles);
  assert.deepEqual(c.leftOut, []);
  // Its tiles, districts, streets, lots and places are its own (measured 2026-10-10: every one as today's). The props
  // came out 1,124 of 1,129: a few are drawn from the world's one random stream (4.6 item 6) - 99% is the floor.
  assert.ok(c.tilesSame / c.awayTiles >= 0.995, `tiles the same: ${c.tilesSame} of ${c.awayTiles}`);
  assert.equal(c.layers.dist, 0); assert.equal(c.layers.zone, 0);
  assert.equal(c.roads.same, c.roads.today, JSON.stringify(c.roads)); assert.equal(c.roads.island, c.roads.today);
  assert.ok(c.roads.today >= 4);
  assert.equal(c.buildings.same, c.buildings.today, JSON.stringify(c.buildings)); assert.ok(c.buildings.today >= 5);
  assert.equal(c.pois.same, c.pois.today, JSON.stringify(c.pois)); assert.ok(c.pois.today >= 4);
  assert.ok(c.props.same / c.props.today >= 0.99, JSON.stringify(c.props));
  assert.deepEqual(c.regions, ['r3-6', 'r3-7']);
});
