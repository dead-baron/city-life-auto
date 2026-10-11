// World v3, stage 2, step 3 (docs/WORLD-V3.md 8.5): the other gulf places built at their place - Cedar Isle, Westport
// and the airport. Step A, the proof, for each: built at its v3 position at today's size (scale 1), every position the
// build takes from today's world placed - the fields and the farm stand, the estates, the golf club's spot, the
// airports, the country sites, the lakes' boat hire, the nature sites' anchors (shared/naturesites.js H.place) - and
// position hashes read back in today's coordinates, it comes out as the island built in today's frame (4.7's island
// build), moved by the offset. (The frame holds today's whole map moved, so the other islands' land - what tells a
// bridge from a road - is where it is in the island build. About 20 s: two builds per place.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { ISLANDS, PIECES } from '../shared/world3-skeleton.js';
import { comparePlaced } from '../tools/world3-place.mjs';
import { MAP_W, MAP_H } from '../shared/constants.js';

function stepA(key) {
  const pic = (ISLANDS.find((I) => I.key === key) || PIECES.find((I) => I.key === key)).picture;
  const dx = pic.at[0] - pic.from[0], dy = pic.at[1] - pic.from[1];
  const ref = generateCity(1337, { island: key });
  const placed = generateCity(1337, { island: key, frame: { w: MAP_W + dx + 8, h: MAP_H + dy + 8 }, place: { at: pic.at, scale: 1, from: pic.from } });
  return comparePlaced(ref, placed, dx, dy);
}
// (the per-tile layers that must agree to the tile, and the shares of the rest: as measured, 8.5)
function check(r, min) {
  for (const k of ['land', 'dist', 'zone', 'river', 'distSea']) assert.equal(r.layers[k], 0, `${k}: ${r.layers[k]} tiles differ`);
  assert.ok(r.layers.roadRank <= 0.002 * r.landTiles, `roadRank: ${r.layers.roadRank} tiles differ`);
  const share = (k) => r[k].same / r[k].today;
  assert.ok(r.landTiles - r.layers.tiles >= min.tiles * r.landTiles, `tiles ${r.landTiles - r.layers.tiles} of ${r.landTiles}`);
  for (const k of ['roads', 'buildings', 'pois', 'props']) assert.ok(share(k) >= min[k], `${k} ${r[k].same} of ${r[k].today}: missing ${JSON.stringify(r[k].missingByKind)}`);
}

test('Westport built at its gulf place, at scale 1, is the island build moved', () => {
  const r = stepA('westport');
  assert.equal(r.extraLand, 0);
  check(r, { tiles: 0.999, roads: 1, buildings: 1, pois: 1, props: 0.99 });
});

test('Cedar Isle built at its gulf place, at scale 1, is the island build moved (its farms, lakes, golf club, sites)', () => {
  const r = stepA('cedar');
  // (Paradise Cay, a scene island raised out of the open sea, isn't placed: it stays where today's is - 4.7)
  assert.ok(r.extraLand <= 150, `land placed off the island: ${r.extraLand}`);
  check(r, { tiles: 0.995, roads: 0.97, buildings: 0.98, pois: 0.95, props: 0.87 });
});

test('the airport built at its gulf place, at scale 1, is the island build moved (the runway, terminal, hangars)', () => {
  const r = stepA('airport');
  assert.equal(r.extraLand, 0);
  check(r, { tiles: 0.99, roads: 1, buildings: 1, pois: 0.8, props: 0.85 });
});
