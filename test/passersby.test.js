// Passers-by and the places that aren't theirs (the owner's notes, 2026-10-23): a skate park's ground is the skaters' -
// a wanderer never heads onto it or across it and one who's on it walks off it (server npc.js skateAt / skateOff); and
// someone filming or taking photos does it from open ground with nothing solid between them and what they film
// (server personas.js filmFrom - "Guy taking picture through wall").
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import * as npc from '../server/systems/npc.js';
import { filmFrom } from '../server/systems/personas.js';

// an open patch of walkable ground (tx, ty: its top left tile) w x h tiles, with a margin of walkable ground round it
function openPatch(m, w, h, margin = 6) {
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40; ty += 5) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 5) {
    let ok = true;
    for (let dy = -margin; dy < h + margin && ok; dy++) for (let dx = -margin; dx < w + margin && ok; dx++) { const t = m.tiles[m.idx(tx + dx, ty + dy)]; if (PED_BLOCK[t] || t === T.ROAD || t === T.BRIDGE || t === T.FLOOR || t === T.DIRT) ok = false; }
    if (ok) return { tx, ty };
  }
  return null;
}

test('passers-by keep off a skate park: never onto it or across it, off it if they find themselves on it', () => {
  const world = makeWorld(), m = world.map;
  const P = openPatch(m, 8, 6, 8);
  assert.ok(P, 'an open patch for the park');
  const was = m.skateSpots;
  m.skateSpots = [{ name: 'Test Skate Park', x: P.tx, y: P.ty, w: 8, h: 6, seats: [] }];
  try {
    const q = m.skateSpots[0], X0 = q.x * TILE, Y0 = q.y * TILE, X1 = X0 + q.w * TILE, Y1 = Y0 + q.h * TILE, cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    assert.equal(npc.skateAt(m, cx, cy), q);
    assert.equal(npc.skateAt(m, X0 - 3 * TILE, cy), null);
    assert.ok(npc.skateCrossed(m, X0 - 2 * TILE, cy, X1 + 2 * TILE, cy), 'a line across it crosses it');
    assert.ok(!npc.skateCrossed(m, X0 - 2 * TILE, Y0 - 2 * TILE, X1 + 2 * TILE, Y0 - 2 * TILE), 'one along its edge, outside, does not');
    const off = npc.skateOff(m, q, X0 + 20, cy);
    assert.ok(off && !npc.skateAt(m, off.x, off.y) && off.x < X0, `off it by the near (west) side: ${JSON.stringify(off)}`);
    const { p } = joinPlayer(world);
    teleport(world, p.ped, cx, Y1 + 5 * TILE);   // (someone about: the NPCs aren't cleared away)
    const on = [], round = [];
    for (let k = 0; k < 6; k++) on.push(npc.spawnNpc(world, 'casual', X0 + 40 + k * 30, Y0 + 40 + (k % 3) * 50));
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; round.push(npc.spawnNpc(world, 'casual', cx + Math.cos(a) * (q.w * TILE / 2 + 110), cy + Math.sin(a) * (q.h * TILE / 2 + 110))); }
    const skater = npc.spawnNpc(world, 'casual', cx, cy); skater.gt = 'skate';   // (a skater: theirs to ride)
    for (const e of [...on, ...round, skater]) { e.npc.state = 'wander'; e.npc.wx = e.x; e.npc.wy = e.y; e.npc.until = 0; e.npc.keep = true; }
    const start = round.map((e) => [e.x, e.y]);
    const inside = (e) => !e.dead && !e.removed && !e.npc.act && npc.skateAt(m, e.x, e.y);
    run(world, 25);
    const still = on.filter(inside);
    assert.equal(still.length, 0, `everyone who was on it has walked off it (${still.length} still on it)`);
    let entered = 0;
    for (let s = 0; s < 40; s++) { run(world, 1); for (const e of [...on, ...round]) if (inside(e) && e.npc.state === 'wander') entered++; }
    assert.equal(entered, 0, 'nobody wandering about walks onto it');
    assert.ok(round.some((e, i) => Math.hypot(e.x - start[i][0], e.y - start[i][1]) > 100), 'they do walk about (round it)');
  } finally { m.skateSpots = was; }
});

test('filming from open ground in sight of it - never pressed against a wall, never through one', () => {
  const world = makeWorld(), m = world.map;
  // a pavement tile against a building's wall, with the building on its north side, and the far side of the building
  let wall = null;
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40 && !wall; ty += 2) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40 && !wall; tx += 2) {
    if (m.tiles[m.idx(tx, ty)] !== T.SIDEWALK || m.tiles[m.idx(tx, ty - 1)] !== T.BUILDING) continue;
    let d = 1; while (d < 30 && m.tiles[m.idx(tx, ty - d)] === T.BUILDING) d++;
    if (d >= 4 && d < 30 && !PED_BLOCK[m.tiles[m.idx(tx, ty - d - 1)]]) wall = { x: (tx + 0.5) * TILE, y: ty * TILE + 6, fx: (tx + 0.5) * TILE, fy: (ty - d - 2) * TILE };
  }
  assert.ok(wall, 'a pavement against a wall');
  assert.equal(filmFrom(m, wall.x, wall.y, wall.fx, wall.fy), false, 'not from against the wall, through the building');
  assert.equal(filmFrom(m, wall.x, wall.y, wall.x, wall.y + 300), false, 'not pressed up against the wall even facing away from it');
  const P = openPatch(m, 10, 10, 4);
  const ox = (P.tx + 5) * TILE, oy = (P.ty + 5) * TILE;
  assert.equal(filmFrom(m, ox, oy, ox + 200, oy), true, 'from open ground, in sight of it');
  // something wild happens on the far side of the building: the one against its wall doesn't film it through the wall
  const { p } = joinPlayer(world);
  teleport(world, p.ped, wall.x + 200, wall.y + 120);
  const c = npc.spawnNpc(world, 'casual', wall.x, wall.y);
  c.npc.state = 'wander';
  for (let k = 0; k < 40; k++) { c.npc.filmedAt = -1e9; npc.spectacle(world, wall.fx, wall.fy, { r: 900, near: 60, chance: 5 }); }
  assert.notEqual(c.npc.state, 'film', 'no filming through the wall');
  assert.ok(!c.filming);
});
