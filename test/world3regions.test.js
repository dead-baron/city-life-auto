// World v3b (docs/WORLD-V3.md part 9): every regional place at its spot on the owner's map, checked in isolation on
// layers built from shared/world3-layout.js's polygons (tools/world3b/layers.mjs) - the whole v3 build waits for the
// frame's land on the new layout. Each place on land (not the sea, a lake or a river - but for the places on the water
// on purpose), the towns' ground mostly land and clear of the city's districts, the arterials they need named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layers3b, GROUND3B } from '../tools/world3b/layers.mjs';
import { regionPlaces } from '../tools/world3b/regions.mjs';
import { TOWNS3, TOWN_ROADS3 } from '../shared/world3-towns.js';
import { MESA } from '../shared/world3-mesa.js';
import { GULCH } from '../shared/world3-desert.js';
import { EGRET } from '../shared/world3-west.js';

// the places on the water on purpose: the island in the lake (made land by world3-water.js), the falls on their creek,
// the farm docks (points in the river), the dam across it
const WET = new Set(['Kestrel island', 'Silver Thread Falls', 'Hollins Farm Dock', 'Brightwater Farm Dock', 'Mill Farm Dock', 'lock', 'Red Rock Dam']);
// the city's districts the other helper lays out (part 9.3): the mainland city, the western city, the gulf's islands
const CITY = [[2650, 1450, 4240, 2110], [1150, 1880, 2400, 2960], [2316, 2086, 4522, 3414]];

test('World v3b: every regional place on land on the owner\'s map, off the city', () => {
  const L = layers3b(), bad = [];
  for (const o of regionPlaces()) {
    if (o.kind !== 'pt' || WET.has(o.name) || o.group === 'skeleton-town' && /Metro City|Westport|Cedar Falls|Coral Cay|Gull Harbor/.test(o.name)) continue;
    const a = L.at(o.p[0], o.p[1]);
    if (!a.land) bad.push(`${o.group} ${o.name} at ${o.p}: water ${a.water}`);
    else if (o.group !== 'skeleton-town' && o.group !== 'landmark' && CITY.some(([x0, y0, x1, y1]) => o.p[0] >= x0 && o.p[1] >= y0 && o.p[0] < x1 && o.p[1] < y1) && a.ground === GROUND3B.city) bad.push(`${o.group} ${o.name} at ${o.p}: in the city`);
  }
  assert.deepEqual(bad, []);
});

test('World v3b: the towns\' ground mostly land, their main streets on their arterials', () => {
  const L = layers3b(), bad = [];
  for (const t of [...TOWNS3, MESA, GULCH]) {
    const boxes = Array.isArray(t.ground[0][1]) ? t.ground.flatMap(([, bs]) => bs) : t.ground;
    let n = 0, wet = 0;
    for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { n++; if (!L.at(x, y).land) wet++; }
    if (wet / n > 0.15) bad.push(`${t.name}: ${Math.round(100 * wet / n)}% of its ground on water`);
    const R = TOWN_ROADS3.find((r) => r.name === t.main.line);
    if (!R) { bad.push(`${t.name}: no arterial '${t.main.line}' in TOWN_ROADS3`); continue; }
    // the arterial passes the main street's run (within 60 tiles of its middle)
    const mx = (t.main.a + t.main.b) / 2, my = t.main.y;
    let d = 1e9;
    for (let j = 1; j < R.pts.length; j++) {
      const [ax, ay] = R.pts[j - 1], [bx, by] = R.pts[j], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, s = Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / l2));
      d = Math.min(d, Math.hypot(ax + dx * s - mx, ay + dy * s - my));
    }
    if (d > 60) bad.push(`${t.name}: '${t.main.line}' passes ${Math.round(d)} tiles from its main street`);
  }
  // Egret Point's Wharf Street meets the Redwood Coast Road's end
  const rc = TOWN_ROADS3.find((r) => r.name === 'Redwood Coast Road'), end = rc.pts[rc.pts.length - 1], wharf = EGRET.streets[0][1][0];
  if (Math.hypot(end[0] - wharf[0], end[1] - wharf[1]) > 4) bad.push('Egret Point: the Redwood Coast Road doesn\'t reach Wharf Street');
  assert.deepEqual(bad, []);
});
