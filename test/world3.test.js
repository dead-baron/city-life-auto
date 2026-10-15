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

test('the v3 frame (World v3b): 6552 x 4032 tiles, 13 x 8 regions of 504, each a whole number of net chunks', () => {
  assert.equal(REGION_TILES, 504);
  assert.equal(REGION_TILES % CHUNK_TILES, 0);
  assert.equal(REGION_CHUNKS * CHUNK_TILES, REGION_TILES);
  assert.deepEqual([FRAME_W, FRAME_H, REGIONS_X, REGIONS_Y, REGION_COUNT], [6552, 4032, 13, 8, 104]);
  assert.deepEqual([FRAME_CHUNKS_X, FRAME_CHUNKS_Y], [273, 168]);
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

// (WR3's placements, spike, island-build and skeleton-network tests went with WR3's layout: World v3b's skeleton is
// checked by test/world3b.test.js)
import { readFileSync } from 'node:fs';
import * as SKEL from '../shared/world3-skeleton.js';

const { RADIUS, HIGHWAYS, ARTERIALS, MAIN_LINE, MAIN_JUNCTIONS, SERVICES, SUBWAYS, STATIONS, TOWNS, INTERCHANGES, CLOSURES } = SKEL;
const skLines = SKEL.skeletonLines();
const skLine = (name) => skLines.find((l) => l.name === name);
const near = (a, b, d) => Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d;

test('the skeleton is plain data, integer frame tiles, built the same every time, with no engine-dependent maths', () => {
  const a = JSON.stringify(SKEL.skeletonData()), b = JSON.stringify(SKEL.skeletonData());
  assert.equal(a, b);
  for (const k of ['MAINLAND', 'BIOMES', 'ISLANDS', 'HIGHWAYS', 'ARTERIALS', 'MAIN_LINE', 'SUBWAYS', 'FERRIES', 'STATIONS', 'TOWNS', 'LANDMARKS', 'INTERCHANGES', 'CLOSURES', 'SERVICES', 'LAKES', 'RIVER']) {
    assert.deepEqual(JSON.parse(JSON.stringify(SKEL[k])), SKEL[k], `${k} is plain data`);
  }
  const ints = (pts, what) => { for (const p of pts) assert.ok(Number.isInteger(p[0]) && Number.isInteger(p[1]), `${what}: ${p}`); };
  for (const L of skLines) {
    ints(L.line.pts, L.name);
    assert.ok(L.line.pts.length >= 2, L.name);
    for (const [i, j] of [...(L.line.tunnels || []), ...(L.line.bridges || [])]) assert.ok(i >= 0 && i < j && j < L.line.pts.length, `${L.name}: stretch ${i}-${j}`);
  }
  ints(SKEL.MAINLAND, 'the mainland');
  for (const s of STATIONS) ints([s.at], s.name);
  // CLAUDE.md: no Math.random, no transcendental Math (Safari's differ), `**` only to square
  const src = readFileSync(new URL('../shared/world3-skeleton.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Math\.(random|sin|cos|tan|asin|acos|atan|atan2|exp|log|pow|hypot|cbrt)\b/);
  assert.doesNotMatch(src, /\*\*(?!\s*2\b)/);
});

