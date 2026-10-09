// The world map screen (client/worldmap.js): its picture (assets/map, baked by tools/build-worldmap2.mjs) is this
// world's, and the GPS route to a waypoint (client/route.js) follows the roads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { makeWorld } from './helpers.js';
import { mapSignature } from '../shared/map.js';
import { createRouter } from '../client/route.js';

test('the world map\'s picture is this world\'s (run node tools/build-worldmap2.mjs after changing the world)', () => {
  const meta = JSON.parse(readFileSync(new URL('../assets/map/meta.json', import.meta.url)));
  const m = makeWorld().map;
  assert.equal(meta.sig, mapSignature(m), 'baked for another world: the map would fall back to the plain tile map');
  assert.ok(existsSync(new URL('../assets/map/overview.webp', import.meta.url)), 'the overview');
  for (let r = 0; r < meta.rows; r++) for (let c = 0; c < meta.cols; c++) assert.ok(existsSync(new URL(`../assets/map/t/${c}_${r}.webp`, import.meta.url)), `tile ${c},${r}`);
});

test('the GPS route runs along the roads from you to the waypoint, driving or on foot', () => {
  const m = makeWorld().map;
  const R = createRouter(m);
  const hosp = m.pois.filter((p) => p.kind === 'hospital');
  const near = (x, y) => m.edges.some((e) => e.pts.some((p, i) => {
    if (!i) return false;
    const a = e.pts[i - 1], dx = p.x - a.x, dy = p.y - a.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    return Math.hypot(a.x + dx * t - x, a.y + dy * t - y) < (e.hw || 64) + 8;
  }));
  for (const [a, b] of [[hosp[0], hosp[1]], [hosp[2], hosp[4]]]) for (const driving of [true, false]) {
    R.key = '';
    const r = R.update({ x: a.x, y: a.y }, { x: b.x, y: b.y }, driving, 1e9);
    assert.ok(r, `a way from ${a.label} to ${b.label}`);
    const straight = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(r.len >= straight * 0.99 && r.len < straight * 4, `a sensible length (${Math.round(r.len)} for ${Math.round(straight)})`);
    assert.deepEqual([r.pts[0].x, r.pts[0].y], [a.x, a.y]);
    assert.deepEqual([r.pts.at(-1).x, r.pts.at(-1).y], [b.x, b.y]);
    // everything but the walk to and from the road is on a road
    for (const p of r.pts.slice(2, -2)) assert.ok(near(p.x, p.y), `on a road at ${Math.round(p.x)},${Math.round(p.y)}`);
  }
});
