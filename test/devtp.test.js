// The debug teleport (client/devtp.js): its places come from what the page holds of the whole world - the districts'
// middles (the index's mids), every rail loop's stations, the landmarks, the handcrafted districts' records - never
// the window's tiles, which only cover where you are (the owner, 2026-10-17: "I don't see the teleport options"); the
// server finds the ground where you land (server/dev.js tpSpot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { teleportPlaces, teleportGroups } from '../client/devtp.js';
import { tpSpot } from '../server/dev.js';

test('the teleport lists the whole world from a window: districts, every line\'s stations, landmarks, a plan\'s places and sights', () => {
  const map = {
    frame: { w: 6552, h: 4032 }, x0: 2000, y0: 1500, w: 300, h: 300,   // (a window: its tiles are no use for far places)
    mids: [[1, 3000, 1780, 1], [7, 3200, 2200, 1], [4, 3600, 1500, 1]],
    rails: [{ stations: [{ name: 'Midtown Station', platform: { x: 104000, y: 53300 } }] }, { stations: [{ name: 'Union Square', kiosk: { out: { x: 99000, y: 59000 } } }] }],
    landmarks: [{ name: 'Gull Point Light', x: 100, y: 100, w: 10, h: 10 }],
    world3hand: { midtown: { d: 1, rect: [2860, 1660, 3680, 1900], places: [{ name: 'Union Square', x0: 3124, y0: 1850, x1: 3170, y1: 1892 }], sights: [{ name: 'The Palace', x: 100000, y: 57000 }] } },
  };
  const L = teleportPlaces(map), names = L.map((p) => p.name);
  for (const n of ['Midtown', 'Downtown', 'Neon Strip', 'Midtown Station', 'Gull Point Light', 'The Palace']) assert.ok(names.includes(n), n);
  assert.ok(L.some((p) => p.group === 'Stations' && p.name === 'Union Square'), 'the second line\'s station');
  assert.ok(L.some((p) => p.group === 'Midtown · places' && p.name === 'Union Square'), 'and the plan\'s square of the same name');
  assert.deepEqual(teleportGroups(map).slice(0, 2), ['Midtown · places', 'Midtown · buildings'], 'the handcrafted districts first');
  for (const p of L) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), p.name);
});

test('the server lands a teleport on the open pavement nearest the place', () => {
  const W = 40, tiles = new Uint8Array(W * W).fill(T.BUILDING);
  tiles[30 * W + 31] = T.SIDEWALK; tiles[22 * W + 22] = T.GRASS;
  const m = { tiles, inside: (x, y) => x >= 0 && y >= 0 && x < W && y < W, idx: (x, y) => y * W + x };
  const a = tpSpot(m, 20.5 * TILE, 20.5 * TILE);
  assert.deepEqual([a.x / TILE, a.y / TILE], [22.5, 22.5], 'open ground near when there\'s no pavement close');
  tiles[21 * W + 21] = T.SIDEWALK;
  const b = tpSpot(m, 20.5 * TILE, 20.5 * TILE);
  assert.deepEqual([b.x / TILE, b.y / TILE], [21.5, 21.5], 'the pavement first');
});
