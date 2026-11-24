// People on foot who don't stay pinned (the owner, 11-23: "NPCs stuck on fences, in corners, between a lamp and a fence
// (skate park); one inside the pool table"): someone at an activity walking to their spot steps aside like anyone
// walking (server/systems/npc.js sidestep) and, held both ways three times running, gives the activity up; a pool
// game's players go round the table, never across it (activities.js roundBox).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { TILE, T, K } from '../shared/constants.js';
import { roundBox } from '../server/systems/activities.js';
import { spawnNpc } from '../server/systems/npc.js';
import { fenceSegments } from '../shared/fences.js';

test('round a pool table: every way from one side to the other keeps off it', () => {
  const B = { x0: 1000, y0: 1000, x1: 1100, y1: 1052 };
  const inside = (x, y) => x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1;
  for (const [sx, sy, tx, ty] of [[980, 1026, 1120, 1026], [1050, 985, 1050, 1068], [985, 985, 1115, 1068], [1115, 1040, 985, 990], [1040, 1066, 1060, 986]]) {
    let x = sx, y = sy;
    for (let i = 0; i < 400 && Math.hypot(tx - x, ty - y) > 3; i++) {
      const w = roundBox(x, y, tx, ty, B, 12), d = Math.hypot(w.x - x, w.y - y) || 1, s = Math.min(2, d);
      x += (w.x - x) / d * s; y += (w.y - y) / d * s;
      assert.ok(!inside(x, y), `from ${sx},${sy} to ${tx},${ty}: at ${x.toFixed(0)},${y.toFixed(0)} on the table`);
    }
    assert.ok(Math.hypot(tx - x, ty - y) <= 3, `from ${sx},${sy}: got to ${tx},${ty}`);
  }
  // (standing on it already: off by the nearest side)
  const o = roundBox(1010, 1026, 1200, 1026, B, 12);
  assert.ok(o.x < B.x0, 'off the near end first');
});

// open grass with a chain-link fence across it, a painter's spot on the far side
const w = makeWorld();
const m = w.map;
function openPatch() {
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40; ty += 3) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 3) {
    let ok = true;
    for (let dy = 0; dy < 14 && ok; dy++) for (let dx = 0; dx < 40 && ok; dx++) {
      const i = m.idx(tx + dx, ty + dy);
      if (m.tiles[i] !== T.GRASS || m.solidProps.has(i) || m.bld[i] >= 0) ok = false;
    }
    if (ok && !fenceSegments(m).some((s) => Math.abs(s.x0 / TILE - tx) < 50 && Math.abs(s.y0 / TILE - ty) < 30)) return [tx, ty];
  }
  return null;
}
const P = openPatch();
const gy = (P[1] + 7) * TILE;
m.props.push({ t: 'chainfence', x: P[0] * TILE, y: gy, tx: 40 * TILE, ty: 0 });

test('someone at an activity whose way to their spot is fenced off: not pinned against the fence for good', () => {
  const { p } = joinPlayer(w);
  teleport(w, p.ped, (P[0] + 20) * TILE, gy - 6 * TILE);
  const e = spawnNpc(w, 'casual', (P[0] + 20) * TILE, gy - 40);
  e.npc.act = { k: 'painter', x: (P[0] + 20) * TILE, y: gy + 90, a: 0 };
  e.npc.state = 'wander';
  let gaveUp = 0;
  for (let i = 0; i < 20 * 20; i++) {
    players.queueInput(p, { seq: i + 1, bits: 0, mx: 0, my: 0, aim: 0 });
    w.step();
    if (!e.npc.act) { gaveUp = w.time; break; }
  }
  assert.ok(gaveUp > 0, 'gave the spot up (or got round) instead of pressing into the fence');
  assert.ok(e.y < gy, 'and never through the chain-link');
});
