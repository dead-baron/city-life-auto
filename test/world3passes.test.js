// World v3 on the server and in the city worker (docs/WORLD-V3.md 8.23, H49):
// - the generator's passes only v3 builds reach live in shared/world3-passes.js, registered with map.js when
//   shared/world3-islands.js is imported: the city worker's fallback generator (client/worldgen.js) doesn't load them;
// - the systems that looked through the world's whole lists each tick (the traffic's parking spots, bike racks and spawn
//   edges, the ambulances' start junctions) look through spatial indexes - and pick exactly what the whole lists' loops
//   and filters picked (synthetic lists here: no city to build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closure } from '../tools/perf.mjs';
import { pointGrid } from '../server/pointgrid.js';
import { edgesNear } from '../server/systems/traffic.js';
import { mulberry32 } from '../shared/rng.js';

test('the city worker loads the generator without World v3\'s passes; World v3\'s builds register them', () => {
  const worker = closure(['client/worldgen.js'], { dynamic: true });
  assert.ok(worker.includes('shared/map.js'), 'the worker still loads the generator (it builds when the server can\'t serve the city)');
  assert.ok(!worker.includes('shared/world3-passes.js'), 'World v3\'s passes are not in the city worker\'s code');
  const map = readFileSync(new URL('../shared/map.js', import.meta.url), 'utf8');
  for (const f of ['buildQuays', 'buildContainerPort', 'buildRailHubs', 'railSwitches', 'hubPlan', 'addRailBore']) assert.ok(!new RegExp(`function ${f}\\(`).test(map), `${f} is World v3's: shared/world3-passes.js`);
  const passes = readFileSync(new URL('../shared/world3-passes.js', import.meta.url), 'utf8');
  assert.match(passes, /setWorld3Passes\(/, 'world3-passes.js registers itself');
  assert.match(readFileSync(new URL('../shared/world3-islands.js', import.meta.url), 'utf8'), /import '\.\/world3-passes\.js'/, 'every v3 build (they import world3-islands.js) gets the passes');
});

test('the parking spots and bike racks near a player: the grid\'s indices are every spot within reach, in the list\'s order', () => {
  const rnd = mulberry32(49);
  const spots = Array.from({ length: 6000 }, () => ({ x: rnd() * 160000, y: rnd() * 129000 }));
  const g = pointGrid(spots);
  for (let k = 0; k < 60; k++) {
    const x = rnd() * 160000, y = rnd() * 129000, r = k % 2 ? 1150 : 1100;
    const near = g.near(x, y, r);
    for (let i = 1; i < near.length; i++) assert.ok(near[i] > near[i - 1], 'ascending, once each');
    const inReach = spots.map((s, i) => [s, i]).filter(([s]) => (s.x - x) ** 2 + (s.y - y) ** 2 <= r * r).map(([, i]) => i);
    const got = near.filter((i) => (spots[i].x - x) ** 2 + (spots[i].y - y) ** 2 <= r * r);
    assert.deepEqual(got, inReach, 'the loop over the grid\'s indices visits exactly the spots in reach, in order');
  }
});

test('the spawn edges near a player: the grid gives what the whole list\'s filter by box gave, in the same order', () => {
  const rnd = mulberry32(7);
  const edges = Array.from({ length: 3000 }, (_, id) => {
    const x = rnd() * 160000, y = rnd() * 129000, n = 2 + Math.floor(rnd() * 4), pts = [{ x, y }];
    for (let k = 1; k < n; k++) pts.push({ x: pts[k - 1].x + (rnd() - 0.5) * 3000, y: pts[k - 1].y + (rnd() - 0.5) * 3000 });
    return { id, pts, kind: rnd() < 0.1 ? 'alley' : 'street', len: 100 + rnd() * 2000 };
  });
  const net = { edges };
  const box = (e) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of e.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { x0, y0, x1, y1 }; };
  const keep = (a) => (e) => { const bb = box(e); return e.kind !== 'alley' && bb.x1 > a.x - 1600 && bb.x0 < a.x + 1600 && bb.y1 > a.y - 1600 && bb.y0 < a.y + 1600 && e.len > 200; };
  for (let k = 0; k < 80; k++) {
    const a = { x: rnd() * 160000, y: rnd() * 129000 };
    assert.deepEqual(edgesNear(net, a.x, a.y, 1600).filter(keep(a)).map((e) => e.id), edges.filter(keep(a)).map((e) => e.id));
  }
});

test('the ambulance\'s start junctions: the grid\'s points within lo-hi are the whole list\'s, in its order', () => {
  const rnd = mulberry32(11);
  const nodes = Array.from({ length: 8000 }, () => ({ x: Math.round(rnd() * 160000), y: Math.round(rnd() * 129000) }));
  for (let k = 0; k < 60; k++) {
    const x = rnd() * 160000, y = rnd() * 129000, [lo, hi] = [[650, 1300], [650, 1400], [500, 2200], [400, 3200]][k % 4];
    const whole = nodes.filter((n) => { const d = Math.hypot(n.x - x, n.y - y); return !(d < lo || d > hi); });
    assert.deepEqual(pointGrid(nodes).within(x, y, lo, hi), whole);
  }
});
