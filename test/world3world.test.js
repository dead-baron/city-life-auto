// World v3, stage 2, step 4 (docs/WORLD-V3.md 8.6): the whole v3 world in one build - generateCity(seed, { world3: true,
// frame, land, today }). One build (about 70 s here: today's world, the land, then the world), checked against the
// single builds of 8.4 and 8.5. The live world is test/world3.test.js's (its hash doesn't change).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { prepare, sizes } from '../tools/world3-build.mjs';

test('World v3: the whole world in one build - every gulf place, the small islands, the mainland\'s ground', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  assert.equal(m.w, FRAME_W); assert.equal(m.h, FRAME_H);
  const rows = Object.fromEntries(sizes(m, prep.land).map((r) => [r.key, r]));
  // each gulf place at its gulf place and size, as built alone (8.4, 8.5 Step B: land / road edges / buildings / POIs)
  const alone = { metro: [256920, 546, 484, 228], cedar: [241727, 246, 205, 159], westport: [216792, 320, 334, 170], airport: [21126, 19, 4, 3] };
  for (const [k, [land, edges, blds, pois]] of Object.entries(alone)) {
    const r = rows[k];
    assert.ok(Math.abs(r.land - land) <= land * 0.001, `${k}: land ${r.land}, alone ${land}`);
    // (more edges than alone: the skeleton's roads cross the places and meet their streets - 8.7: Westport 373 / 320,
    // the airport 26 / 19 with Airport Road and Runway Road)
    assert.ok(r.edges >= edges * 0.9 && r.edges <= Math.max(edges * 1.3, edges + 10), `${k}: road edges ${r.edges}, alone ${edges}`);
    assert.ok(r.buildings >= blds * 0.9 && r.buildings <= blds * 1.15, `${k}: buildings ${r.buildings}, alone ${blds}`);
    assert.ok(r.pois >= pois * 0.9 && r.pois <= pois * 1.2, `${k}: POIs ${r.pois}, alone ${pois}`);
  }
  // Pelican Key, Northshore and Gull Harbor (scale 1) have their streets and buildings; the other small islands their land
  for (const k of ['pelican', 'northshore', 'gull']) assert.ok(rows[k].edges > 5 && rows[k].buildings > 5, `${k}: ${JSON.stringify(rows[k])}`);
  for (const k of ['coral', 'paradise', 'lighthouse', 'smuggler']) assert.ok(rows[k].land > 1000, `${k}: ${rows[k].land} land tiles`);
  // the mainland: its ground dressed (trees, rocks, scrub); its roads are the skeleton's (test/world3roads.test.js)
  assert.ok(rows.mainland.land > 10e6, `mainland land ${rows.mainland.land}`);
  assert.ok(rows.mainland.props > 100000, `mainland props ${rows.mainland.props}`);
  // everything in the frame: what no piece builds went off it and was dropped
  const inF = (x, y) => x >= 0 && y >= 0 && x < m.w * TILE && y < m.h * TILE;
  for (const e of m.edges) for (const p of e.pts) assert.ok(inF(p.x, p.y), `edge ${e.name || e.kind} at ${p.x}, ${p.y}`);
  for (const b of m.buildings) assert.ok(m.inside(b.tx, b.ty), `building ${b.kind} at ${b.tx}, ${b.ty}`);
  for (const p of m.pois) assert.ok(inF(p.x, p.y), `POI ${p.kind} at ${p.x}, ${p.y}`);
  // today's bridges between today's islands are cut at the shores; the skeleton's crossings between built places listed
  const names = new Set(m.world3.crossings.map((c) => c.name));
  for (const n of ['Union Bridge', 'Harbor Footbridge', 'Northshore Lift Bridge', 'Harbor Tunnel', 'Eastgate Bridge', 'Southbank Walk', 'Cedar North Bridge', 'Toll Point Bridge', 'Airport Road', 'Runway Road', 'Pelican Walk']) assert.ok(names.has(n), `crossing ${n} listed`);
  assert.ok(m.world3.cut.includes('Bay Bridge'), 'the Bay Bridge cut at the shore');
});
