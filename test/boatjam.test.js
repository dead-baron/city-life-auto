// NPC boats jammed on a wall, a dock or an inlet's end (the owner, 10-16: "NPC boats stuck on walls, docks and
// inlets"): server/systems/boats.js boatSteer feels its way along the hull's width; meaning to go and going nowhere a
// couple of seconds, it backs off turning and its skipper picks somewhere else to go - one that keeps jamming is given
// up once nobody's looking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { K, T, TILE } from '../shared/constants.js';
import { BOAT_BLOCK } from '../shared/map.js';
const { spawnNpc } = await import('../server/systems/npc.js');
const boats = await import('../server/systems/boats.js');

test('a boat driven at a quay backs off and heads somewhere else', () => {
  const w = makeWorld(), m = w.map;
  // open sea running north up to a quay wall: the boat a few tiles off it, the skipper meaning to go on through
  let at = null;
  for (let ty = m.y0 + 20; ty < m.y0 + m.h - 20 && !at; ty += 3) for (let tx = m.x0 + 20; tx < m.x0 + m.w - 20; tx += 3) {
    const open = (x, y) => !BOAT_BLOCK[m.tiles[m.idx(x, y)]] && !m.land[m.idx(x, y)];
    if (!BOAT_BLOCK[m.tiles[m.idx(tx, ty - 1)]] || !open(tx, ty)) continue;
    let ok = true;
    for (let dy = 0; dy < 10 && ok; dy++) for (let dx = -6; dx <= 6; dx++) if (!open(tx + dx, ty + dy)) { ok = false; break; }
    for (let dy = 1; dy <= 6 && ok; dy++) if (!BOAT_BLOCK[m.tiles[m.idx(tx, ty - dy)]]) ok = false;
    if (ok) at = [tx, ty];
  }
  assert.ok(at, 'a quay over open water');
  const X = (at[0] + 0.5) * TILE, Y = (at[1] + 3) * TILE;
  const { p } = joinPlayer(w); teleport(w, p.ped, X + 6 * TILE, (at[1] - 3) * TILE);   // (someone about: the boats out here are kept)
  const v = w.spawnVehicle('dinghy', X, Y, -Math.PI / 2, {});
  const d = spawnNpc(w, 'casual', X, Y, 'driver');
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  const inland = { x: X, y: (at[1] - 12) * TILE };
  v.ai = { kind: 'boater', to: inland, speed: 300 };
  v.despawnable = false;
  let jammedAt = 0;
  for (let k = 0; k < 20 * 12; k++) { w.step(); if (v.ai && v.ai.jams && !jammedAt) jammedAt = w.time; }
  assert.ok(v.ai && v.ai.jams >= 1, 'it noticed it was jammed');
  assert.ok(v.ai.to && v.ai.to !== inland && !BOAT_BLOCK[m.tileAtPx(v.ai.to.x, v.ai.to.y)], 'and heads for somewhere on the water instead');
  void boats; void K;
});
