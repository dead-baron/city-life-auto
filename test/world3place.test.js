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
