// Off-screen spawning and view-based net culling: nothing pops into existence on a player's
// screen, and everything on screen was already sent to that player beforehand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { viewRect, netRect, setView } from '../server/view.js';

const inside = (r, e, pad = 0) => e.x >= r.x0 - pad && e.x <= r.x1 + pad && e.y >= r.y0 - pad && e.y <= r.y1 + pad;

test('traffic and pedestrians spawn off screen; everything on screen was sent before it got there', () => {
  const w = makeWorld({ npcBudget: 700 });
  const { p } = joinPlayer(w);
  setView(p, 900, 500);
  w.time = 50; p.joinedAt = 0; // past the "just arrived" grace where parked cars may fill in nearby
  const seen = new Set(w.entities.keys());
  let spawnedInView = 0, spawned = 0, unsentInView = 0;
  const r = {};
  // walk the player steadily east across the city (teleport steps: a brisk 300 px/s)
  const x0 = p.ped.x, y0 = p.ped.y;
  for (let i = 0; i < 20 * 25; i++) {
    teleport(w, p.ped, x0 + 15 * (i < 250 ? i : 500 - i), y0);
    w.step();
    viewRect(w, p, r);
    for (const e of w.entities.values()) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.kind === K.VEH || (e.kind === K.PED && e.npc && !e.vehId && !e.npc.desk && !e.onTrain)) { // (train riders are out of sight under the roof)
        spawned++;
        if (inside(r, e)) { spawnedInView++; if (process.env.DBG) console.log('SPAWNED', e.kind, e.npc && e.npc.role, e.npc && e.npc.state, e.model, e.ai && e.ai.kind, e.parked, e.onTrain, Math.round(e.x - (r.x0 + r.x1) / 2), Math.round(e.y - (r.y0 + r.y1) / 2), 'tick', w.tick); }
      }
    }
    for (const e of w.query((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, Math.hypot(r.x1 - r.x0, r.y1 - r.y0) / 2)) {
      if (e.kind !== K.PED && e.kind !== K.VEH) continue;
      if (e.sub) continue; // down in the subway: a level of its own, deliberately not shown up top
      if (inside(r, e) && !p.known.has(e.id)) { unsentInView++; if (process.env.DBG) console.log('UNSENT', e.kind, e.npc && e.npc.role, e.vehId, e.onTrain, e.hidden, e.removed, Math.round(e.x - (r.x0 + r.x1) / 2), Math.round(e.y - (r.y0 + r.y1) / 2), 'tick', w.tick); }
    }
  }
  assert.ok(spawned > 10, `the city filled in around the player (${spawned})`);
  assert.equal(spawnedInView, 0, 'nothing spawned on screen');
  assert.equal(unsentInView, 0, 'everything on screen had been sent');
});

test('the send window reaches further ahead of a fast car than behind it', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const car = w.spawnVehicle('sports', p.ped.x, p.ped.y, 0, {});
  p.ped.vehId = car.id; car.seats[0] = p.ped.id;
  car.vx = 600; car.vy = 0;
  const n = netRect(w, p, {}), v = viewRect(w, p, {});
  assert.ok(n.x1 - v.x1 > v.x0 - n.x0 + 300, 'prefetch ahead of travel');
  assert.ok(v.x1 - v.x0 > 2 * 780 * 1.3, 'camera zooms out at speed');
});
