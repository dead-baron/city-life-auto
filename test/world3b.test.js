// World v3b (docs/WORLD-V3.md part 9): the owner's layout as the skeleton and the land - the frame, the highways'
// bridges, the main loop and its stations, the subways below ground on land, no level crossing of the main line in the
// city. Fast: the skeleton's paths and the land's layers only (the whole world build is test/world3world.test.js's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_W, FRAME_H, REGIONS_X, REGIONS_Y, PLACEMENTS } from '../shared/world3.js';
import * as SK from '../shared/world3-skeleton.js';
import { GROUND3 } from '../shared/world3-layout.js';
import { buildLand3, WATER3 } from '../shared/world3-land.js';
import { mainLineLoops } from '../shared/world3-rail.js';
import { subwayLoops } from '../shared/world3-subway.js';
import { TILE, T } from '../shared/constants.js';

const lines = SK.skeletonLines();
let LAND = null;
const land = () => (LAND ||= buildLand3());

test('the frame is 6552 x 4032 (13 x 8 regions); nothing of today\'s world is placed whole', () => {
  assert.deepEqual([FRAME_W, FRAME_H, REGIONS_X, REGIONS_Y], [6552, 4032, 13, 8]);
  assert.deepEqual(Object.keys(PLACEMENTS), []);
  assert.equal(SK.PIECES.length, 0);
  assert.equal(SK.CANAL, null);
  for (const I of SK.ISLANDS) assert.ok(!I.picture && !I.placement, `${I.key}: no picture, no placement`);
  for (const L of lines) for (const p of L.path.pts) assert.ok(p[0] >= 0 && p[1] >= 0 && p[0] < FRAME_W && p[1] < FRAME_H, `${L.name} inside the frame`);
});

test('every highway\'s (and arterial\'s and rail line\'s) water crossings are bridges; every highway end is at an interchange', () => {
  for (const L of lines) {
    if (L.kind === 'ferry') continue;
    for (let s = 0; s <= L.path.length; s += 4) {
      const [x, y] = SK.pointAt(L.path, s);
      if (!SK.landAt(x, y)) assert.ok(SK.inRanges(L.bridges, s, 1) || SK.inRanges(L.tunnels, s, 1), `${L.name} over water at ${Math.round(x)}, ${Math.round(y)} is a bridge`);
    }
  }
  for (const H of SK.HIGHWAYS) {
    // one end at an interchange at least; a free end is on land, at its town (the East Highway's at Sandpiper Bay, the
    // Casino Highway's at Lucky Mesa: the towns' streets meet it)
    const atIc = (e) => SK.INTERCHANGES.some((ic) => Math.hypot(ic.at[0] - e[0], ic.at[1] - e[1]) < 2);
    const ends = [H.pts[0], H.pts[H.pts.length - 1]];
    assert.ok(ends.some(atIc), `${H.name} meets another highway`);
    for (const e of ends) assert.ok(atIc(e) || SK.landAt(e[0], e[1]), `${H.name}'s end ${e} at an interchange or on land`);
  }
  // the highways cross the gulf: some bridges each for the loops
  for (const name of ['Gulf Loop', 'West Loop', 'East Island Link']) assert.ok(lines.find((l) => l.name === name).bridges.length >= 2, `${name} bridges the water`);
  // the arterials: 25-50, each named once, the island bridges among them
  assert.ok(SK.ARTERIALS.length >= 25 && SK.ARTERIALS.length <= 50, `${SK.ARTERIALS.length} arterials`);
  assert.equal(new Set(SK.ARTERIALS.map((a) => a.name)).size, SK.ARTERIALS.length);
  for (const A of SK.ARTERIALS) for (const e of [A.pts[0], A.pts[A.pts.length - 1]]) assert.ok(SK.landAt(e[0], e[1]), `${A.name}'s end ${e} on land`);
  assert.ok(SK.ARTERIALS.filter((a) => a.foot).length >= 3, 'footbridges');
});

test('the main loop closes, one service runs it both ways, every station on it (on straight track)', () => {
  const ML = SK.MAIN_LINE[0], P = ML.pts;
  assert.equal(SK.MAIN_LINE.length, 1);
  assert.deepEqual(P[0], P[P.length - 1], 'the loop closes');
  assert.deepEqual(SK.MAIN_JUNCTIONS[0].at, P[0]);
  assert.deepEqual(SK.SERVICES.map((s) => s.name), ['Grand Loop']);
  const path = lines.find((l) => l.kind === 'main').path, main = SK.STATIONS.filter((s) => s.line === 'main');
  assert.equal(main.length, 13);
  for (const st of main) {
    assert.ok(SK.nearestOnPath(path, st.at[0], st.at[1]).d < 3, `${st.name} on the loop`);
    assert.ok(SK.SERVICES[0].stops.includes(st.name), `${st.name} a stop`);
  }
  const loops = mainLineLoops();
  assert.equal(loops.length, 2, 'both ways');
  for (const l of loops) {
    assert.equal(l.stations.length, 13);
    const a = l.pts[0], b = l.pts[l.pts.length - 1];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 2 * TILE, `${l.name} closes`);
    assert.ok(l.pts.some((p) => p.under) && l.pts.some((p) => !p.under), `${l.name}: underground through the dense city only`);
    assert.ok(l.pts.some((p) => p.elevated), `${l.name}: the Midtown stretch flagged elevated`);
  }
});

test('no level crossing of the main line inside the city areas; the subways\' stations on their loops', () => {
  const inCity = (x, y) => GROUND3.city.some((poly) => SK.inPoly(poly, x, y));
  const cx = SK.skeletonCrossings(lines);
  const bad = cx.crossings.filter((c) => c.kind === 'level crossing' && inCity(c.x, c.y));
  assert.deepEqual(bad.map((c) => `${c.a} x ${c.b} at ${c.x}, ${c.y}`), []);
  for (const sw of SK.SUBWAYS) {
    assert.ok(sw.loop);
    assert.deepEqual(sw.pts[0], sw.pts[sw.pts.length - 1], `${sw.name} closes`);
    const path = lines.find((l) => l.name === sw.name).path, mine = SK.STATIONS.filter((s) => s.line === sw.name);
    assert.ok(mine.length >= 8, `${sw.name}: ${mine.length} stations`);
    for (const st of mine) assert.ok(SK.nearestOnPath(path, st.at[0], st.at[1]).d < 3, `${st.name} on the ${sw.name}`);
    assert.ok(mine.some((s) => s.name === 'Union Square'), `${sw.name} calls at the interchange`);
    // a station every 350-600 m or so (on land: some stretches cross the water)
    assert.ok(path.length / mine.length >= 350 && path.length / mine.length <= 650, `${sw.name}: ${Math.round(path.length / mine.length)} m a station`);
  }
});

test('the land: the islands and the biomes; the subways below ground on land, up only by the water', () => {
  const L = land(), Ly = L.layers, W = L.w;
  assert.deepEqual([L.w, L.h], [FRAME_W, FRAME_H]);
  const at = (x, y) => y * W + x;
  // the islands are land, the gulf between them sea; the lakes lakes
  for (const I of SK.ISLANDS.filter((I) => I.poly.length > 40)) {
    const [x0, y0, x1, y1] = I.box, cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
    let landN = 0, n = 0;
    for (let y = y0; y < y1; y += 8) for (let x = x0; x < x1; x += 8) if (SK.inPoly(I.poly, x, y)) { n++; landN += Ly.land[at(x, y)] || Ly.water[at(x, y)] === WATER3.LAKE || Ly.water[at(x, y)] === WATER3.STREAM ? 1 : 0; }
    assert.ok(landN / n > 0.97, `${I.key}: ${landN}/${n} land (${cx}, ${cy})`);
  }
  assert.equal(Ly.water[at(3200, 2060)] === WATER3.SEA || Ly.water[at(3200, 2060)] === WATER3.DEEP, true, 'the gulf north of the big island');
  // the ground follows the sketch: forest in the north-west, desert in the east, fields in the valley
  const cls = (x, y) => Ly.terrain[at(x, y)];
  assert.equal(cls(1300, 800), 2, 'forest in the north-west');
  assert.equal(cls(4700, 1300) === 3 || cls(4700, 1300) === 5 || cls(4700, 1300) === 4, true, 'desert in the east');
  // the subways: with the land as the map, below ground on land and up near the water only
  const fake = { tileAtPx: (px, py) => { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); return x < 0 || y < 0 || x >= W || y >= L.h ? T.DEEP : Ly.land[at(x, y)] ? T.GRASS : T.WATER; } };
  const loops = subwayLoops(fake);
  assert.equal(loops.length, 4, 'two lines, each both ways');
  for (const l of loops) {
    let dryUp = 0;
    for (const p of l.pts) {
      if (p.under) continue;
      // at grade: within 12 tiles (and a sample's slack) of the water
      let near = false;
      for (let d = -16; d <= 16 && !near; d += 4) for (let e = -16; e <= 16 && !near; e += 4) if (fake.tileAtPx(p.x + d * TILE, p.y + e * TILE) === T.WATER) near = true;
      if (!near) dryUp++;
    }
    assert.equal(dryUp, 0, `${l.name}: up only by the water`);
    assert.ok(l.pts.filter((p) => p.under).length > l.pts.length / 2, `${l.name}: mostly underground`);
  }
});
