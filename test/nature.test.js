// The designed nature places (shared/naturesites.js) and the wild's layout (shared/map.js buildWilds).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, DISTRICTS } from '../shared/map.js';
import { T, TILE } from '../shared/constants.js';

const m = generateCity(1337);
const tileAt = (x, y) => m.tiles[Math.floor(y / TILE) * m.w + Math.floor(x / TILE)];
const solidNear = (x, y, r) => { for (const arr of m.solidProps.values()) for (const e of arr) if (Math.hypot(e.x - x, e.y - y) <= r) return true; return false; };

test('Redwood Creek: Highland Road crosses the creek on a railed bridge; falls, pool, footbridge, camp, pull-off', () => {
  const s = (m.natureSites || []).find((q) => q.kind === 'creek');
  assert.ok(s, 'the creek is built');
  assert.equal(DISTRICTS[m.dist[Math.floor(s.y / TILE) * m.w + Math.floor(s.x / TILE)]].name, 'Highland Woods');
  // the road stays a road over the creek, with water either side of it and a solid rail along both edges
  const b = s.bridge, ux = Math.cos(b.a), uy = Math.sin(b.a), nx = -uy, ny = ux;
  assert.equal(tileAt(b.x, b.y), T.ROAD, 'the road runs on over the creek');
  let water = 0;
  for (const side of [-1, 1]) for (let t = 0; t < 60; t += 8) if (tileAt(b.x + nx * side * (b.roadHw + 20 + t), b.y + ny * side * (b.roadHw + 20 + t)) === T.WATER) { water++; break; }
  assert.equal(water, 2, 'the creek on both sides of the road');
  for (const side of [-1, 1]) for (const k of [-80, 0, 80]) assert.ok(solidNear(b.x + ux * k + nx * side * (b.roadHw + 6), b.y + uy * k + ny * side * (b.roadHw + 6), 14), `a rail on the ${side < 0 ? 'west' : 'east'} edge`);
  // the pool below the falls is water you can swim in; the ledge above it is solid
  assert.equal(tileAt(s.pool.x, s.pool.y), T.WATER);
  assert.ok(solidNear(s.falls.x, s.falls.y - 8, 12), 'the ledge is solid');
  // the footbridge: planks you walk across
  let planks = 0;
  for (let t = -80; t <= 80; t += 8) if (tileAt(s.footbridge.x + Math.cos(s.footbridge.a) * t, s.footbridge.y + Math.sin(s.footbridge.a) * t) === T.DOCK) planks++;
  assert.ok(planks >= 3, `the footbridge has planks (${planks})`);
  // the camp: a lit fire, tents; the pull-off: a gravel lot with a picnic table
  const near = (t, p, r) => m.props.some((q) => q && q.t === t && Math.hypot(q.x - p.x, q.y - p.y) < r);
  assert.ok(near('campfire', s.camp, 40) && m.props.some((q) => q && q.t === 'campfire' && q.lit && Math.hypot(q.x - s.camp.x, q.y - s.camp.y) < 40), 'a lit campfire');
  assert.ok(near('tent', s.camp, 160), 'tents');
  assert.equal(tileAt(s.pulloff.x, s.pulloff.y), T.LOT);
  assert.ok(near('picnic', s.pulloff, 90), 'a picnic table at the pull-off');
  // giant redwoods, and the place on the map
  assert.ok(m.props.filter((q) => q && q.sp === 'redwood' && Math.hypot(q.x - s.x, q.y - s.y) < 900).length >= 6, 'giant redwoods round it');
  assert.ok(m.landmarks.some((l) => l.name === 'Redwood Creek Falls'));
});

test('the wild grows in groves of one kind of tree, clear of the roads', () => {
  const wild = m.props.filter((p) => p && (p.t === 'tree_a' || p.t === 'tree_b') && p.g !== undefined);
  assert.ok(wild.length > 6000, `plenty of wild trees (${wild.length})`);
  // groves: most wild trees have another within 100 px (they grow together, not scattered evenly)
  const grid = new Map(), k = (x, y) => Math.floor(x / 128) * 1000 + Math.floor(y / 128);
  for (const p of wild) { const key = k(p.x, p.y); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(p); }
  let close = 0;
  for (const p of wild.slice(0, 2000)) {
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) for (const q of grid.get(k(p.x + dx * 128, p.y + dy * 128)) || []) if (q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 100) { found = true; break; }
    if (found) close++;
  }
  assert.ok(close / 2000 > 0.75, `trees grow together (${(close / 20).toFixed(0)}% have a neighbour within 100 px)`);
  // no wild tree stands on or right beside a road
  for (const p of wild) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.notEqual(m.tileAt(tx + dx, ty + dy), T.ROAD, `a tree at ${p.x},${p.y} is by a road`);
  }
  // one kind of tree per stand: neighbours mostly share it
  let same = 0, pairs = 0;
  for (const p of wild.slice(0, 3000)) for (const q of grid.get(k(p.x, p.y)) || []) if (q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 90) { pairs++; if (q.g === p.g) same++; }
  assert.ok(same / pairs > 0.85, `stands are one kind (${(same / pairs * 100).toFixed(0)}%)`);
});
