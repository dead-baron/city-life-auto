// Dirt-bike country (the nature program, 2026-10-20: Nature-C1): the Red Rock MX Park in World v3's desert
// (shared/world3-dirt.js) - its course, berms, tabletops, the gate and the timing tower, the floodlights, the pits and
// their bikes, the lap race - and the clients' tabletop jumps (client/art2/game/jumps.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { MX } from '../shared/world3-dirt.js';
import { jumpLift, JUMP } from '../client/art2/game/jumps.js';
import { prepare } from '../tools/world3-build.mjs';

test('a tabletop: a bike rides up its ramp, flies off the lip fast enough, lands; slow, it just rolls over it', () => {
  const J = { x: 1000, y: 500, a: 0, len: 416, w: 112, h: 30, ramp: 128 }, map = { jumps: [J] };
  const ride = (speed) => {
    const v = { rx: J.x - J.len / 2 - 300, ry: J.y }, zs = [];
    for (let t = 0; t < 1400 / speed; t += 1 / 60) { v.rx += speed / 60; zs.push(jumpLift(map, v, t)); }
    return zs;
  };
  const fast = ride(520), slow = ride(80);
  assert.ok(Math.max(...fast) > J.h + 15, `the flight's top ${Math.max(...fast).toFixed(1)} px`);
  assert.equal(fast[fast.length - 1], 0, 'down again past it');
  assert.ok(fast.every((z) => z >= 0));
  assert.ok(Math.max(...slow) <= J.h + 0.01 && Math.max(...slow) > J.h - 1, 'rolled over the top');
  // the other way along it: the same
  const back = (() => { const v = { rx: J.x + J.len / 2 + 300, ry: J.y }, zs = []; for (let t = 0; t < 3; t += 1 / 60) { v.rx -= 520 / 60; zs.push(jumpLift(map, v, t)); } return zs; })();
  assert.ok(Math.max(...back) > J.h + 15, 'flown the other way too');
  // beside it: nothing
  const v = { rx: J.x, ry: J.y + 200 }; assert.equal(jumpLift(map, v, 0), 0);
  assert.ok(JUMP.MIN > 80);
});

test('World v3: the Red Rock MX Park - the course, its berms and tabletops, the gate, the pits and their bikes, the lap race', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const D = m.world3.dirt;
  assert.ok(D && D.mx && D.missed.length === 0, `built (${D && D.missed.join('; ')})`);
  const site = m.natureSites.find((s) => s.kind === 'mx' && s.name === MX.name);
  assert.ok(site && m.landmarks.some((l) => l.name === MX.name), 'the park on the map');
  assert.equal(m.dist[m.idx(Math.floor(site.x / TILE), Math.floor(site.y / TILE))], MX.district, "in the Red Rock Desert");
  // the course: dirt all the way round, closed, a dirt track for the bake
  const tr = (m.tracks || []).find((t) => t.mx);
  assert.ok(tr && tr.pts.length > 100, 'the course drawn as dirt');
  let off = 0; for (const [x, y] of tr.pts) if (m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))] !== T.DIRT) off++;
  assert.equal(off, 0, `${off} of the course's points off its dirt`);
  const [a, b] = [tr.pts[0], tr.pts[tr.pts.length - 1]]; assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 40, 'a loop');
  // berms, tabletops (each a jump the clients know), the gate, the tower, the lights, the fence, the tape and the tyres
  const count = (t) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - site.x, p.y - site.y) < 3000).length;
  assert.ok(count('berm') >= 12, `${count('berm')} berms`);
  assert.ok(count('tabletop') >= 3 && (m.jumps || []).length === count('tabletop'), `${count('tabletop')} tabletops, ${(m.jumps || []).length} jumps`);
  for (const J of m.jumps) assert.equal(m.tiles[m.idx(Math.floor(J.x / TILE), Math.floor(J.y / TILE))], T.DIRT, 'a tabletop on the course');
  assert.ok(count('startgate') === 1 && count('timingtower') === 1 && count('floodmast') >= 4 && count('fenceline') >= 4 && count('tapeline') >= 6 && count('tires') >= 4, 'the gate, the tower, the lights, the fence, the tape, the tyres');
  // the pits: trailers, the tent, the bikes on their stands (dirt bikes to take), the trucks
  assert.ok(count('mxtrailer') === 2 && count('canopy') >= 1, 'the pits');
  const bikes = m.parking.filter((p) => p.mx && p.model === 'dirtbike'), trucks = m.parking.filter((p) => p.mx && p.model !== 'dirtbike');
  assert.ok(bikes.length >= 4 && trucks.length >= 2, `${bikes.length} bikes, ${trucks.length} trucks`);
  for (const p of [...bikes, ...trucks]) { const t = m.tiles[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))]; assert.ok(t === T.DIRT || t === T.SAND || t === T.GRASS, `a parked bike on open ground (tile ${t})`); }
  // the lap race: three laps from the gate, its checkpoints on the course, its place on the map
  const race = m.races.find((r) => r.name === MX.name);
  assert.ok(race && race.kind === 'dirt' && race.laps === MX.laps && race.cps.length === race.laps * race.lapLen, 'the race');
  for (const c of race.cps) assert.equal(m.tiles[m.idx(Math.floor(c.x / TILE), Math.floor(c.y / TILE))], T.DIRT, 'a checkpoint on the course');
  assert.ok(m.pois.some((p) => p.kind === 'race' && p.label === MX.name), 'its place');
  // the way in: dirt from the road to the gap in the fence
  const box = m.landmarks.find((l) => l.name === MX.name);
  let roadNear = false; for (let dy = 1; dy <= 18 && !roadNear; dy++) for (let dx = 0; dx < box.w / TILE; dx += 2) if (m.tiles[m.idx(Math.floor(box.x / TILE) + dx, Math.floor(box.y / TILE) - dy)] === T.ROAD) { roadNear = true; break; }
  assert.ok(roadNear, 'a road along its north side');
});
