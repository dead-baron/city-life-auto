// The batch-4 fleet on World v3 (the heavy lock: one build): every new car has districts of its own on the map's roads
// and kerbs (server/systems/traffic.js DISTRICT_MIX, the country's mix), the bigger boats take marina berths only on big
// water where their hulls clear the piers (traffic.js marinaModel), the boaters' craft come up only on big water (boats.js
// spawnPoint), the floatplanes moor off the marinas on big water and float there, the air ambulance waits at a hospital.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { TILE } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { trafficMix, parkedMix, marinaModel } from '../server/systems/traffic.js';
import { wildStyle } from '../server/systems/wildlife.js';
import * as boats from '../server/systems/boats.js';
import * as aircraft from '../server/systems/aircraft.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const CARS = ['convertible', 'lowrider', 'muscle', 'hothatch', 'jeep', 'movingvan', 'icecream'];
const BOATS = ['sailboat', 'pontoon', 'trawler', 'cabincruiser', 'rib'];

test('World v3: every new car is in the traffic on some road and parked at some kerb', () => {
  const onRoad = new Set(), parked = new Set();
  for (const e of M.net.edges) {
    if (e.kind === 'alley' || e.notraffic || e.len < 200) continue;
    const p = e.pts[Math.floor(e.pts.length / 2)], st = M.districtAt(p.x, p.y).style, country = e.kind !== 'hwy' ? wildStyle(M, p.x, p.y) : null;
    for (const [id] of trafficMix(st, country)) if (!(e.kind === 'dirt' && id === 'movingvan')) onRoad.add(id);
  }
  for (const sp of M.parking) if (!sp.model && !sp.drive) for (const [id] of parkedMix(M.districtAt(sp.x, sp.y).style)) parked.add(id);
  for (const id of CARS) assert.ok(onRoad.has(id), `${id}: on World v3's roads`);
  for (const id of CARS.filter((c) => c !== 'jeep')) assert.ok(parked.has(id), `${id}: parked at World v3's kerbs`);
});

test('World v3: the new boats only on big water - the boaters\' and the marinas\' - and the floatplanes moored there', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const at = new Map();
  M.marina.forEach((sp, i) => {
    const m = marinaModel(w, sp, i);
    if (!BOATS.includes(m)) return;
    at.set(m, (at.get(m) || 0) + 1);
    assert.ok(boats.waterSize(M, sp.x, sp.y, 2500) >= 2500, `a ${m}'s berth on big water`);
  });
  assert.ok(at.size >= 3, `the new boats at the marinas: ${[...at].map(([m, n]) => `${m} ${n}`).join(', ')}`);
  for (const id of BOATS) assert.ok(at.has(id) || boats.MODELS.some(([m]) => m === id), `${id}: comes up somewhere`);
  // the boaters' craft (each of the new ones among them) come up only at big water's points
  let n = 0;
  for (const p of M.seaPoints) { if (n > 300) break; if (boats.bigWater(w, p)) n++; }
  assert.ok(n > 300, 'big water for the boaters');
  // the floatplanes: moored off a few marinas, on big water with room for their wings
  const sea = aircraft.seaplaneSpots(M);
  assert.ok(sea.length >= 1, `floatplane moorings (${sea.length})`);
  for (const s of sea) assert.ok(boats.waterSize(M, s.x, s.y, 2500) >= 2500, 'on big water');
  // one parked there floats (no sinking, no ditching) - and the air ambulance waits at a hospital's pad
  const w2 = new World(M, { npcBudget: 0, throwErrors: true });
  aircraft.update(w2, 0.05);
  const kinds = new Set(w2.airSpots.map((s) => s.m));
  assert.ok(kinds.has('seaplane') && kinds.has('medheli'), `the parked aircraft: ${[...kinds].join(', ')}`);
  const w3 = new World(M, { npcBudget: 0, throwErrors: true });
  w3.airSpots = [];   // (none parked: only these two)
  const v = w3.spawnVehicle('seaplane', sea[0].x, sea[0].y, sea[0].a, {});
  v.despawnable = false;   // (nobody's near it in this world: the traffic would tidy it away)
  const pl = w3.spawnVehicle('plane', sea[0].x + 300, sea[0].y, 0, {}); pl.despawnable = false;   // (a light plane on the water: it sinks)
  for (let i = 0; i < 60; i++) w3.step();
  assert.ok(!v.sinkAt && !v.wreckAt && !v.removed, 'the floatplane floats');
  assert.ok(pl.sinkAt || pl.removed || pl.wreckAt || !boats.bigWater(w3, { x: pl.x, y: pl.y }), 'a light plane put down on the water doesn\'t');
  assert.ok(VEHICLES.seaplane.floats);
  void TILE;
});
