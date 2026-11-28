// A dock's edge: walking stops at the railing (shared/physics.js, b1c), so facing open water the prompt says "Jump in"
// and sends you off the side the way a dive roll would (server/systems/players.js jumpIn - the Rusty Spur notes, 11-17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { T } from '../shared/constants.js';
import { isSwimming } from '../shared/map.js';
import { findInteraction, jumpInSpot } from '../server/systems/players.js';

function dockEdge(m) {
  for (let ty = 0; ty < m.h; ty++) for (let tx = 2; tx < m.w - 8; tx++) {
    if (m.tileAt(tx, ty) === T.DOCK && m.tileAt(tx - 1, ty) === T.DOCK && [1, 2, 3, 4, 5, 6].every((k) => [T.WATER, T.DEEP].includes(m.tileAt(tx + k, ty)))) return { x: tx * 32 + 20, y: ty * 32 + 16 };
  }
  return null;
}

test('a dock edge facing the water: "Jump in" puts you in the water; facing the planks, no prompt', () => {
  const w = makeWorld(); const m = w.map;
  const spot = dockEdge(m);
  assert.ok(spot, 'a dock edge exists');
  const { p } = joinPlayer(w);
  teleport(w, p.ped, spot.x, spot.y);
  p.ped.a = Math.PI;   // (back to the water)
  assert.equal(jumpInSpot(w, p.ped), null, 'facing back along the planks: nothing to jump into');
  p.ped.a = 0;   // (facing the water, east)
  assert.ok(jumpInSpot(w, p.ped), 'facing the water: a way in');
  const it = findInteraction(w, p);
  assert.ok(it && it.label === 'Jump in', `the prompt: ${it && it.label}`);
  it.run();
  let seq = p.ack || 0;
  for (let i = 0; i < 40; i++) { p.inputQ.push({ seq: ++seq, bits: 0, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.ok(isSwimming(m, p.ped), `in the water (tile ${m.tileAtPx(p.ped.x, p.ped.y)})`);
  assert.equal(jumpInSpot(w, p.ped), null, 'swimming: no prompt');
});

test('no "Jump in" with a crate in your arms or away from a dock', () => {
  const w = makeWorld(); const m = w.map;
  const spot = dockEdge(m);
  const { p } = joinPlayer(w);
  teleport(w, p.ped, spot.x, spot.y); p.ped.a = 0;
  p.ped.carrying = 12345;
  assert.equal(jumpInSpot(w, p.ped), null, 'carrying: no');
  p.ped.carrying = 0;
  teleport(w, p.ped, spot.x - 32 * 30, spot.y);
  if (m.tileAtPx(p.ped.x, p.ped.y) !== T.DOCK) assert.equal(jumpInSpot(w, p.ped), null, 'off the dock: no');
});
