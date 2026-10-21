// Dirt-bike country (the nature program, 2026-10-20: Nature-C1): the Red Rock MX Park in World v3's desert
// (shared/world3-dirt.js) - its course, berms, tabletops, the gate and the timing tower, the floodlights, the pits and
// their bikes, the lap race - the long rides (Nature-C1-B: the Red Rock Trail, the Highland Enduro) and the clients'
// tabletop jumps (client/art2/game/jumps.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { MX, RIDES } from '../shared/world3-dirt.js';
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
  const parkJumps = (m.jumps || []).filter((J) => J.name === MX.name);
  assert.ok(count('tabletop') >= 3 && parkJumps.length === count('tabletop'), `${count('tabletop')} tabletops, ${parkJumps.length} jumps`);
  for (const J of m.jumps) assert.equal(m.tiles[m.idx(Math.floor(J.x / TILE), Math.floor(J.y / TILE))], T.DIRT, `${J.name}'s tabletop on its dirt`);
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
  // the long rides: both laid, on ground a bike can ride every step (fords and bridges over the water)
  for (const R of RIDES) {
    const r = D.rides.find((q) => q.name === R.name), st = m.natureSites.find((q) => q.name === R.name);
    assert.ok(r && st && st.line.length > 10, `the ${R.name}`);
    assert.ok(r.len >= (R.kind === 'enduro' ? 300 : 450), `the ${R.name}: ${r.len} tiles`);
    let wet = 0; for (const [x, y] of st.line) { const t = m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))]; if (t === T.WATER || t === T.DEEP || t === T.WALL || t === T.BUILDING) wet++; }
    assert.ok(wet <= 1, `the ${R.name}: ${wet} points off what a bike can ride`);
  }
  const route = D.rides.find((q) => q.name === 'Red Rock Trail'), enduro = D.rides.find((q) => q.name === 'Highland Enduro');
  assert.equal(route.markers, 4, 'the route\'s markers 1 to 4');
  for (const n of ['1', '2', '3', '4']) assert.ok(m.props.some((p) => p && p.t === 'textsign' && p.text === n), `marker ${n}`);
  const rest = m.props.find((p) => p && p.t === 'pergola' && Math.hypot(p.x - 5584 * TILE, p.y - 1648 * TILE) < 2400);
  assert.ok(rest && m.props.some((p) => p && p.t === 'otank' && Math.hypot(p.x - rest.x, p.y - rest.y) < 300) && m.props.some((p) => p && p.t === 'picnic' && Math.hypot(p.x - rest.x, p.y - rest.y) < 100), 'the rest stop: the ramada, its table, the tank');
  assert.ok(D.washTiles >= 100, `the wash: ${D.washTiles} tiles`);
  // the riders' camp off marker 2 (shared/world3-camps.js): its fire to sit by, tents, chairs, their dirt bikes and pickup
  const rc = D.camp, mk2 = m.props.find((p) => p && p.t === 'textsign' && p.text === '2');
  assert.ok(rc && rc.marker === 2 && Math.hypot(rc.x - mk2.x, rc.y - mk2.y) < 16 * TILE && m.restSpots.some((q) => q.x === rc.x && q.y === rc.y && q.where === 'riders'), `the riders' camp by marker 2 (${JSON.stringify(rc)})`);
  const nearC = (t, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - rc.x, p.y - rc.y) < r).length;
  assert.ok(nearC('campfire', 8) === 1 && nearC('tent', 4 * TILE) === 2 && nearC('chair', 3 * TILE) === 3, 'its fire, two tents, three chairs');
  const parked = m.parking.filter((p) => p.ride && Math.hypot(p.x - rc.x, p.y - rc.y) < 7 * TILE);
  assert.ok(parked.filter((p) => p.model === 'dirtbike').length === 2 && parked.some((p) => p.model === 'pickup'), 'their dirt bikes and pickup');
  for (const p of parked) { const i = m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE)); assert.ok(m.land[i] && (m.tiles[i] === T.SAND || m.tiles[i] === T.DIRT || m.tiles[i] === T.GRASS), `${p.model} parked on open ground`); }
  assert.ok(enduro.berms >= 4 && enduro.jumps === 3 && enduro.fords >= 1 && enduro.bridges === 1, `the enduro's berms ${enduro.berms}, jumps ${enduro.jumps}, fords ${enduro.fords}, bridges ${enduro.bridges}`);
  assert.equal(m.jumps.filter((J) => J.name === 'Highland Enduro').length, 3, 'its jump line');
  const es = m.natureSites.find((q) => q.name === 'Highland Enduro');
  const nearE = (t, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - es.x, p.y - es.y) < r).length;
  assert.ok(nearE('rootplate', 8000) === 1 && nearE('rwlog', 8000) >= 1 && nearE('mapboard', 300) >= 1, 'the root plate, the log ride, the board');
  assert.ok(m.parking.filter((p) => p.ride && p.model === 'dirtbike').length >= 3, 'bikes left at the trailhead');
  const tk = m.tracks.find((t) => t.ride === 'Highland Enduro');
  let ford = 0; for (const [x, y] of tk.pts) { const i = m.idx(Math.floor(x / TILE), Math.floor(y / TILE)); if (m.tiles[i] === T.BRIDGE && !m.land[i]) ford++; }
  assert.ok(ford >= 1, 'the splash through the creek (the water under the ford)');
});
