// World v3's land (docs/WORLD-V3.md 8.2; shared/world3-land.js): the skeleton's polygons and lines as per-tile layers.
// Builds today's world once (generateCity(1337), a few seconds) and the v3 land from it twice (about a second each).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateCity } from '../shared/map.js';
import { buildLand3, scanPoly, WATER3, BIOME3, DISTRICTS3, ZONES3 } from '../shared/world3-land.js';
import {
  MAINLAND, BIOMES, ISLANDS, PIECES, CANAL, RIVER, LAKES, STREAMS, STATIONS, TOWNS, LANDMARKS, PORT_WESTPORT,
  linePath, pointAt, skeletonLines, inPoly,
} from '../shared/world3-skeleton.js';
import { PLACEMENTS, placedRect } from '../shared/world3.js';

const today = generateCity(1337);
const L = buildLand3(today);
const { land, water, biome, dist } = L.layers;
const W = L.w, H = L.h;
const idx = (x, y) => Math.floor(y) * W + Math.floor(x);
const hashOf = (B) => { const h = createHash('sha256'); for (const k of Object.keys(B.layers).sort()) h.update(k).update(B.layers[k]); return h.digest('hex'); };

test('the v3 land: the frame, its layers, deterministic (built twice, the same)', () => {
  assert.deepEqual([W, H], [5040, 4032]);
  for (const k of ['land', 'water', 'biome', 'terrain', 'dist', 'zone']) assert.equal(L.layers[k].length, W * H, k);
  assert.equal(hashOf(buildLand3(today)), hashOf(L));
  // the new districts and zones follow today's (ids 47+ and 11+), shaped like shared/map.js DISTRICTS
  DISTRICTS3.forEach((d, k) => { assert.equal(d.id, 47 + k); for (const f of ['name', 'isl', 'style', 'tier', 'walk', 'plaza', 'road', 'ground']) assert.ok(d[f] !== undefined, `${d.name}.${f}`); });
  ZONES3.forEach((z, k) => assert.equal(z.id, 11 + k));
  for (const B of BIOMES) assert.ok(BIOME3[B.key], `biome ${B.key} has its ground`);
});

// 4-connected flood over land from a tile: the set of tiles reached (as a byte grid) and how many.
function flood(x, y) {
  const seen = new Uint8Array(W * H), st = new Int32Array(W * H);
  let sp = 0, n = 0;
  const s0 = idx(x, y);
  if (!land[s0]) return { seen, n };
  seen[s0] = 1; st[sp++] = s0;
  while (sp) {
    const i = st[--sp], tx = i % W; n++;
    for (const k of [tx > 0 ? i - 1 : -1, tx < W - 1 ? i + 1 : -1, i - W, i + W]) if (k >= 0 && k < W * H && land[k] && !seen[k]) { seen[k] = 1; st[sp++] = k; }
  }
  return { seen, n };
}
const polyTiles = (poly) => { const out = []; scanPoly(poly, W, H, (y, a, b) => { for (let x = a; x < b; x++) out.push(y * W + x); }); return out; };
const shoelace = (poly) => { let s = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; return Math.abs(s) / 2; };

test('the canal splits Metro City + Southbank into two landmasses, joined to nothing (the bridges will come)', () => {
  const metro = ISLANDS.find((I) => I.key === 'metro');
  const A = flood(2345, 2208), B = flood(2300, 2620);   // Downtown, Southbank
  assert.ok(A.n > 50000 && B.n > 50000, `Metro City ${A.n} tiles, Southbank ${B.n}`);
  assert.equal(A.seen[idx(2300, 2620)], 0, 'Southbank is not reached from Metro City over land');
  for (const [x, y, what] of [[2440, 1700, 'the mainland'], [3100, 2440, 'Cedar Isle'], [2400, 2900, 'Pelican Key'], [1534, 2060, 'Westport']]) {
    assert.equal(A.seen[idx(x, y)] || B.seen[idx(x, y)], 0, `${what} is not joined to the island`);
  }
  // all but specks of the island's land is one of the two
  const tiles = polyTiles(metro.poly).filter((i) => land[i]);
  const inTwo = tiles.filter((i) => A.seen[i] || B.seen[i]).length;
  assert.ok(inTwo / tiles.length > 0.99, `${inTwo} of ${tiles.length} land tiles in the two halves`);
  // the canal is water along its line inside the island, 55 m wide
  const cp = linePath(CANAL, 60);
  let on = 0, n = 0;
  for (let s = 0; s < cp.length; s += 5) {
    const [x, y] = pointAt(cp, s);
    if (!inPoly(metro.poly, x, y)) continue;
    n++; if (water[idx(x, y)] === WATER3.CANAL) on++;
  }
  assert.ok(n > 30 && on === n, `canal centre: ${on} of ${n} points are canal`);
});

test('each gulf island: its land is its polygon, its districts the picture\'s in about today\'s proportions', () => {
  const W0 = today.w, H0 = today.h;
  for (const I of ISLANDS.filter((I) => I.picture)) {
    const tiles = polyTiles(I.poly), area = shoelace(I.poly);
    assert.ok(Math.abs(tiles.length - area) / area < 0.02, `${I.key}: ${tiles.length} tiles vs the polygon's ${area}`);
    const landT = tiles.filter((i) => land[i]);
    const inland = tiles.filter((i) => !land[i] && water[i] !== WATER3.CANAL);
    assert.equal(inland.length, 0, `${I.key}: all its polygon is land (or the canal)`);
    // the districts: the picture's ids only, shares within 0.08 of today's (the new shore and the canal move a little)
    const ids = I.picture.ids, cnt = new Map(), was = new Map();
    for (const i of landT) cnt.set(dist[i], (cnt.get(dist[i]) || 0) + 1);
    for (const d of cnt.keys()) assert.ok(ids.includes(d), `${I.key}: district ${d} is not one of its picture's`);
    const [fx0, fy0, fx1, fy1] = I.picture.from;
    let wasN = 0;
    for (let y = fy0; y < Math.min(fy1, H0); y++) for (let x = fx0; x < Math.min(fx1, W0); x++) {
      const i = y * W0 + x;
      if (today.land[i] && ids.includes(today.dist[i])) { was.set(today.dist[i], (was.get(today.dist[i]) || 0) + 1); wasN++; }
    }
    for (const d of ids) {
      const a = (cnt.get(d) || 0) / landT.length, b = (was.get(d) || 0) / wasN;
      assert.ok(Math.abs(a - b) < 0.08, `${I.key}: district ${d} is ${(a * 100).toFixed(1)}% of the island, ${(b * 100).toFixed(1)}% today`);
    }
  }
});

test('the lakes, the Long Reach, the streams and the canal are water; the sea is deep away from the shore', () => {
  for (const lk of LAKES) {
    const t = polyTiles(lk.poly);
    assert.ok(t.length > 1000 && t.every((i) => water[i] === WATER3.LAKE), lk.name);
  }
  for (const [line, kind, r] of [[RIVER, WATER3.RIVER, 150], ...STREAMS.map((s) => [s, WATER3.STREAM, 80])]) {
    const p = linePath(line, r);
    for (let s = 0; s <= p.length; s += 8) {
      const [x, y] = pointAt(p, s), w = water[idx(Math.min(W - 1, x), Math.min(H - 1, y))];
      assert.ok(w !== WATER3.LAND, `${line.name} at ${Math.round(x)},${Math.round(y)} is water`);
      assert.ok(w === kind || w === WATER3.LAKE || w === WATER3.SEA || w === WATER3.DEEP, `${line.name} at ${Math.round(x)},${Math.round(y)}: water kind ${w}`);
    }
  }
  // the Long Reach is about its width across (a cut across it at its middle)
  let across = 0;
  for (let x = 3250; x < 3450; x++) if (water[idx(x, 1500)] === WATER3.RIVER) across++;
  assert.ok(across >= RIVER.width - 4 && across <= RIVER.width + 30, `the Long Reach is ${across} m across at y 1500`);
  // the open sea: deep in the middle of the gulf and out at sea, shallow at the shore
  for (const [x, y] of [[2700, 3000], [4800, 3900], [100, 3900], [2600, 2150]]) assert.equal(water[idx(x, y)], WATER3.DEEP, `${x},${y}`);
  assert.equal(water[idx(1189 - 2, 2200)], WATER3.SEA, 'the West Channel is shallow at the port\'s quay');
});

// Points the skeleton puts on water on purpose: the falls are on their creek (its first point).
const ON_WATER = new Set(['Silver Thread Falls']);
test('every station, town and landmark is on land, in its biome or its place\'s districts', () => {
  const bad = [];
  const piece = (x, y) => PIECES.find((P) => { const p = P.picture, k = p.scale; return x >= p.at[0] && y >= p.at[1] && x < p.at[0] + (p.from[2] - p.from[0]) * k && y < p.at[1] + (p.from[3] - p.from[1]) * k; });
  for (const [what, list] of [['station', STATIONS], ['town', TOWNS], ['landmark', LANDMARKS]]) {
    for (const p of list) {
      const [x, y] = p.at, i = idx(x, y), name = `${what} ${p.name} (${p.line || p.kind || ''}) at ${x},${y}`;
      if (ON_WATER.has(p.name)) continue;
      if (!land[i]) { bad.push(`${name}: on water (kind ${water[i]})`); continue; }
      const isl = ISLANDS.find((I) => I.poly && inPoly(I.poly, x, y));
      const placed = ISLANDS.find((I) => I.placement && (() => { const [a, b, c, d] = placedRect(PLACEMENTS[I.placement]); return x >= a && y >= b && x < c && y < d; })());
      if (isl?.picture) { if (!isl.picture.ids.includes(dist[i])) bad.push(`${name}: district ${dist[i]}, not ${isl.name}'s`); continue; }
      if (isl) { if (dist[i] !== (isl.key === 'prison' ? 55 : 56)) bad.push(`${name}: district ${dist[i]} on ${isl.name}`); continue; }
      if (placed) continue;   // (today's island, copied whole: on land is all)
      if (x >= PORT_WESTPORT.rect[0] && y >= PORT_WESTPORT.rect[1] && x < PORT_WESTPORT.rect[2] && y < PORT_WESTPORT.rect[3]) continue;
      if (!inPoly(MAINLAND, x, y)) { bad.push(`${name}: off the skeleton's land`); continue; }
      let k = -1;
      BIOMES.forEach((B, j) => { if (inPoly(B.poly, x, y)) k = j; });
      if (biome[i] !== k + 1) { bad.push(`${name}: biome ${biome[i]}, the skeleton's ${BIOMES[k]?.key}`); continue; }
      const P = piece(x, y);
      if (dist[i] < 47 && !(P && P.picture.ids.includes(dist[i]))) bad.push(`${name}: district ${dist[i]}`);
      if (dist[i] >= 47 && dist[i] !== BIOME3[BIOMES[k].key].dist) bad.push(`${name}: district ${dist[i]}, not ${BIOMES[k].name}'s`);
    }
  }
  assert.deepEqual(bad, []);
});

// Tunnels under water on purpose (the rest are under land like any road).
const UNDER_WATER = new Set(['Harbor Tunnel']);
test('every highway and arterial is on land but along its bridges (the streams get culverts)', () => {
  const bad = [];
  for (const Ln of skeletonLines().filter((l) => l.kind === 'hwy' || l.kind === 'art')) {
    let run = null;
    for (let s = 0; s <= Ln.path.length; s += 2) {
      const [x, y] = pointAt(Ln.path, s);
      const tx = Math.min(W - 1, Math.max(0, Math.floor(x))), ty = Math.min(H - 1, Math.max(0, Math.floor(y))), i = ty * W + tx;
      const onBridge = Ln.bridges.some(([a, b]) => s >= a - 2 && s <= b + 2), inTunnel = Ln.tunnels.some(([a, b]) => s >= a && s <= b);
      const wet = !land[i] && water[i] !== WATER3.STREAM;
      if (wet && !onBridge && !(inTunnel && UNDER_WATER.has(Ln.name))) {
        if (!run) bad.push(run = { line: Ln.name, at: [tx, ty], water: water[i], m: 0 });
        run.m += 2;
      } else run = null;
    }
  }
  assert.deepEqual(bad.map((b) => `${b.line} at ${b.at} (${b.m} m, water ${b.water})`), []);
});

test('the frame\'s edges as the skeleton has them: land along the north, the mainland\'s sides, the open sea south', () => {
  let wetN = 0;
  for (let x = 0; x < W; x++) if (!land[x]) wetN++;
  assert.ok(wetN <= STREAMS[0].width + 2, `the north edge is land but Kestrel Creek (${wetN} tiles of water)`);
  for (let y = 0; y < 740; y++) assert.ok(land[y * W], `west edge ${y}`);
  for (let y = 900; y < H; y++) assert.ok(!land[y * W], `west edge ${y}`);
  for (let y = 0; y < 2300; y++) assert.ok(land[y * W + W - 1], `east edge ${y}`);
  for (let y = 2360; y < H; y++) assert.ok(!land[y * W + W - 1], `east edge ${y}`);
  for (let x = 0; x < W; x++) assert.equal(water[(H - 1) * W + x], WATER3.DEEP, `south edge ${x}`);
});
