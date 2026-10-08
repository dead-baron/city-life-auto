// The edge of the world (shared/border.js): open sea runs on past the map's edge, you're slowed further out and
// stopped at the end, never walled in on the way back; the map itself is unchanged; nobody can hide out there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run } from './helpers.js';
import { EDGE_SLOW, EDGE_OUT, edgeInfo, edgeBrake } from '../shared/border.js';
import { vehStep, pedStep } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { T, TILE, MAP_W, MAP_H, WORLD_W, DT } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import * as players from '../server/systems/players.js';

const boat = (x, y, a) => ({ x, y, a, vx: 0, vy: 0, av: 0, lz: 0 });
const drive = (s, def, map, secs, steer = 0) => { const out = []; for (let i = 0; i < secs / DT; i++) { vehStep(s, { throttle: 1, steer, hb: false }, DT, map, def, { rain: false }); out.push({ x: s.x, y: s.y, sp: Math.hypot(s.vx, s.vy) }); } return out; };

test('past the map\'s edge: open sea for a way, then a wall; the map itself is as it was', () => {
  const w = makeWorld(), m = w.map;
  assert.equal(m.tileAt(-5, 300), T.DEEP, 'just past the west edge: sea');
  assert.equal(m.tileAt(MAP_W + 10, 300), T.DEEP, 'past the east edge: sea');
  assert.equal(m.tileAt(300, -Math.ceil(EDGE_OUT / TILE)), T.DEEP, 'out to the end of the band');
  assert.equal(m.tileAt(-Math.ceil(EDGE_OUT / TILE) - 6, 300), T.WALL, 'beyond it: the old wall');
  assert.equal(m.tiles.length, MAP_W * MAP_H, 'the map\'s own tiles are unchanged');
  const e = edgeInfo(-300, 500);
  assert.ok(Math.abs(e.d - 300) < 1e-9 && e.nx === 1 && e.ny === 0, 'the way back from the west is east');
  const c = edgeInfo(WORLD_W + 30, -40);
  assert.ok(Math.abs(c.d - 50) < 1e-9 && c.nx < 0 && c.ny > 0, 'off a corner: back toward the corner');
});

test('a speedboat heading out is slowed further and further and stopped at the end - and comes back at full speed', () => {
  const w = makeWorld(), m = w.map, def = VEHICLES.speedboat;
  const s = boat(600, 600 * TILE / 2, Math.PI);   // off the west coast, heading west
  const out = drive(s, def, m, 25);
  const far = Math.max(...out.map((q) => -q.x));
  assert.ok(far <= EDGE_OUT + 0.5, `never past the end (${Math.round(far)} px out)`);
  assert.ok(far > EDGE_OUT - 160, `gets close to it (${Math.round(far)} px out)`);
  const at = (d) => out.find((q) => -q.x >= d);
  const fast = Math.max(...out.filter((q) => -q.x < EDGE_SLOW).map((q) => q.sp));
  assert.ok(fast > 450, `free until the slowing starts (${Math.round(fast)} px/s)`);
  assert.ok(at(EDGE_SLOW + 400).sp < fast * 0.4, `well slowed half way through the band (${Math.round(at(EDGE_SLOW + 400).sp)})`);
  assert.ok(out[out.length - 1].sp < 30, `all but stopped at the end (${Math.round(out[out.length - 1].sp)})`);
  // turn round: nothing holds you back
  s.a = 0;
  const back = drive(s, def, m, 6);
  assert.ok(back[back.length - 1].x > 0, 'back inside the map');
  assert.ok(Math.max(...back.map((q) => q.sp)) > fast * 0.9, 'at full speed on the way back');
});

test('swimming out: the same; along the outer line only a crawl', () => {
  const w = makeWorld(), m = w.map;
  const s = { x: -EDGE_SLOW - 20, y: 15000, a: Math.PI, vx: 0, vy: 0, stamina: 100, rollT: 0, rdx: 0, rdy: 0, prevBits: 0, lz: 0 };
  const mods = { speedMul: 1, canMove: true, canSprint: true, canSwim: true, analog: true };
  for (let i = 0; i < 60 / DT; i++) pedStep(s, { bits: IN.SPRINT, mx: -1, my: 0, aim: Math.PI }, DT, m, mods);
  assert.ok(-s.x <= EDGE_OUT + 0.5 && -s.x > EDGE_OUT - 60, `held at the end (${Math.round(-s.x)} px out)`);
  // along the line
  const y0 = s.y;
  for (let i = 0; i < 5 / DT; i++) pedStep(s, { bits: 0, mx: 0, my: 1, aim: 0 }, DT, m, mods);
  assert.ok(Math.abs(s.y - y0) < 5 * 70, `only a crawl along it (${Math.round(Math.abs(s.y - y0))} px in 5 s)`);
  // a thing put past the end (a teleport, a knock) is put back on the line
  const q = { x: -EDGE_OUT - 300, y: 900, vx: -50, vy: 0 };
  edgeBrake(q);
  assert.ok(Math.abs(-q.x - EDGE_OUT) < 1e-6 && q.vx >= 0, 'back on the line, no further out');
});

test('nowhere to hide out there: a wanted player past the edge stays on the police radar, and logs back in on land', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  teleport(w, p.ped, -700, 18000);
  p.ped.swim = true;
  p.heat = 60; p.wanted = 2; p.seenAt = w.time; p.lastSeenX = p.ped.x; p.lastSeenY = p.ped.y;
  run(w, 40);
  assert.equal(p.wanted, 2, 'the heat doesn\'t cool');
  assert.ok(w.time - p.seenAt < 1, 'seen all the while');
  // logging out out there: back on land next time
  players.savePos(p, p.ped);
  const prof = p.profile;
  assert.ok(prof.pos.x < 0, 'the spot was out at sea');
  w.players.delete(p.pid); w.remove(p.ped);
  const { p: p2 } = joinPlayer(w, { ...prof, pos: { ...prof.pos } });
  assert.ok(p2.ped.x > 0 && p2.ped.y > 0 && p2.ped.x < WORLD_W, `back on the map (${Math.round(p2.ped.x)}, ${Math.round(p2.ped.y)})`);
});
