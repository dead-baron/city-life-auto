// The town's ponds' ducks (2026-10-18, the owner: "ducks"): round a player in town, the nearest pond gets a few ducks or
// geese, out of sight; they're tame - walking right up to them they paddle (or waddle) off, they don't take off; a shot
// sends them up. On the water they now and then up-end to feed (APOSE.dabble), drawn tail up (client/art2/birds.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { WATER_T } from '../shared/map.js';
import { APOSE } from '../shared/fauna.js';
import * as wildlife from '../server/systems/wildlife.js';
import { birdModel } from '../client/art2/birds.js';

const ground = (m, x, y) => { const t = m.tileAtPx(x, y); return t === T.GRASS || t === T.SIDEWALK || t === T.PLAZA || t === T.DIRT || t === T.SAND; };

test('a town pond keeps a few tame ducks: they paddle off from you, take off at a shot, up-end to feed', () => {
  const w = makeWorld({ npcBudget: 200 });
  const { p } = joinPlayer(w);
  const m = w.map, ponds = wildlife.parkPonds(m);
  assert.ok(ponds.length > 0, 'the town has ponds');
  // stand on land some way off the first pond (it out of sight), and wait
  const pond = ponds[0];
  let spot = null;
  for (let r = 700; r < 1300 && !spot; r += 60) for (let k = 0; k < 16 && !spot; k++) { const x = pond.x + Math.cos(k * 0.39) * r, y = pond.y + Math.sin(k * 0.39) * r; if (ground(m, x, y) && !wildlife.wildStyle(m, x, y)) spot = { x, y }; }
  assert.ok(spot, 'somewhere to stand');
  teleport(w, p.ped, spot.x, spot.y);
  run(w, 20);
  const ducks = wildlife.animals(w).filter((a) => a.wild.kind === 'duck' || a.wild.kind === 'goose');
  assert.ok(ducks.length > 0, 'ducks on the pond');
  assert.ok(ducks.every((a) => a.wild.tame), 'tame ones');
  assert.ok(ducks.some((a) => WATER_T[m.tileAtPx(a.x, a.y)] === 1), 'on the water');
  // a dabbling pose turns up while they sit on the water
  let dab = false;
  for (let i = 0; i < 40 && !dab; i++) { run(w, 1); dab = ducks.some((a) => !a.dead && a.wild.pose === APOSE.dabble); }
  assert.ok(dab, 'one up-ends to feed');
  // walk right up to one: it paddles off, nobody takes off
  const d = ducks.find((a) => !a.dead && !a.wild.flewOff) || ducks[0];
  let near = null;
  for (let r = 30; r < 200 && !near; r += 10) for (let k = 0; k < 16 && !near; k++) { const x = d.x + Math.cos(k * 0.39) * r, y = d.y + Math.sin(k * 0.39) * r; if (ground(m, x, y)) near = { x, y }; }
  assert.ok(near, 'the bank by a duck');
  teleport(w, p.ped, near.x, near.y);
  run(w, 3);
  assert.ok(ducks.every((a) => a.wild.state !== 'fly' && !a.wild.flewOff), 'none takes off at you');
  // a shot: up they go
  w.shotLog.push({ x: d.x + 40, y: d.y, t: w.time });
  run(w, 1.5);
  assert.ok(ducks.some((a) => a.wild.state === 'fly' || a.wild.flewOff), 'a shot sends them up');
});

test('the dabbling duck: tipped up, its tail and stern above the water, its head under it', () => {
  const swim = birdModel('duck', { pose: 'swim' }), dab = birdModel('duck', { pose: 'dabble', phase: 0.25 });
  const top = (m) => { let z1 = 0, n0 = 0; for (let z = 0; z < m.h; z++) for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y, z)) { z1 = Math.max(z1, z); if (z < 1) n0++; } return [z1, n0]; };
  const [zs] = top(swim), [zd, under] = top(dab);
  assert.ok(zd > zs, `the tail up (${zd} over ${zs})`);
  assert.equal(under, 0, 'nothing drawn under the water');
});
