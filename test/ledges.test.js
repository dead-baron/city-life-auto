// One-way drops at the waterfalls (shared/ledges.js): down a falls or off the cliff it goes over, never back up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, cityData, cityFromData } from '../shared/map.js';
import { TILE } from '../shared/constants.js';
import { dropsOf } from '../shared/ledges.js';
import { pedStep, newPedState } from '../shared/physics.js';

const map = generateCity(1337);
const mods = { speedMul: 1, canMove: true, canSprint: true, regenMul: 1, staminaMax: 100, canSwim: true, analog: true };
const walk = (s, my, secs) => { for (let k = 0; k < secs * 30; k++) pedStep(s, { bits: 0, mx: 0, my, aim: 0 }, 1 / 30, map, mods); return s; };
const site = (name) => map.natureSites.find((q) => q.name === name);

test('every waterfall has its drop, worked out beside the map (the city data and its hashes are untouched)', () => {
  const before = Object.keys(map).join(',');
  const d = dropsOf(map);
  assert.equal(Object.keys(map).join(','), before, 'nothing added to the map');
  assert.ok(d.size > 60, `drops: ${d.size}`);
  for (const s of map.natureSites.filter((q) => q.falls || q.kind === 'coastfalls')) {
    const f = s.falls || s, fx = Math.floor(f.x / TILE), fy = Math.floor(f.y / TILE);
    let near = 0;
    for (const i of d) { const tx = i % map.w, ty = Math.floor(i / map.w); if (Math.abs(tx - fx) <= 20 && Math.abs(ty - fy) <= 6) near++; }
    assert.ok(near > 0, `${s.name}: a drop at its falls`);
  }
  // a copy of the city (a worker's, the browser's) works them out the same
  const M = structuredClone(cityData(map)); cityFromData(M);
  assert.deepEqual([...dropsOf(M)].sort((a, b) => a - b), [...d].sort((a, b) => a - b));
});

test('down the falls, swimming, and off the cliff on foot - but not back up', () => {
  const cases = [
    ['Fern Gorge', 309.0, 172.5],          // the spring pool over its granite ledge
    ['Driftwood Point', 892.5, 1128.4],    // off the basalt cliff onto the beach (on foot)
    ['Willow River', 1078.5, 333.5],       // through the notch in the escarpment
    ['Redwood Creek', 216.5, 168.5],       // the creek over the lip into its pool
    ['Cedar Creek', 601.5, 968.5],         // the little falls out of the pond
    ['Summit Tarn', 575.5, 88.0],          // the tarn spilling over its ledge
  ];
  for (const [name, tx, ty] of cases) {
    assert.ok(site(name), name);
    const s = walk(newPedState(tx * TILE, ty * TILE), 1, 2);
    assert.ok(s.y / TILE > ty + 3, `${name}: went down (row ${(s.y / TILE).toFixed(1)})`);
    walk(s, -1, 3);
    assert.ok(s.y / TILE > ty + 1.5, `${name}: can't get back up (row ${(s.y / TILE).toFixed(1)}, came down from ${ty})`);
  }
});

test('a drop carries you down whatever you press, and the steps beside the cliff still go both ways', () => {
  // halfway over the Fern Gorge ledge, pushing back up: down you go
  const s = newPedState(309 * TILE, 174.3 * TILE);
  walk(s, -1, 0.5);
  assert.ok(s.y > 175 * TILE, `carried down (${(s.y / TILE).toFixed(2)})`);
  // the wooden steps down the Driftwood Point cliff (the gap in the rock): walk down, and back up again
  const d = dropsOf(map), step = (tx, ty) => d.has(ty * map.w + tx);
  let gap = null;
  for (let tx = 880; tx <= 905 && !gap; tx++) if (map.tiles[1129 * map.w + tx] !== 0 && map.tiles[1129 * map.w + tx + 1] !== 0 && map.tiles[1129 * map.w + tx - 1] === 0) gap = tx;
  assert.ok(gap, 'the steps');
  assert.ok(!step(gap, 1129) && !step(gap, 1130), 'the steps are no drop');
  const w = walk(newPedState((gap + 0.9) * TILE, 1132.5 * TILE), -1, 2);
  assert.ok(w.y < 1129 * TILE, `up the steps (${(w.y / TILE).toFixed(1)})`);
});
