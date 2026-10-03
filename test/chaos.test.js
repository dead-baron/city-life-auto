// Chaos playtest: simulated players mash random inputs (driving, stealing cop cars, shooting,
// throwing crates, dev crimes) for several in-game minutes. Any system exception fails the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, players } from './helpers.js';
import { IN } from '../shared/input.js';
import { mulberry32 } from '../shared/rng.js';
import * as law from '../server/systems/law.js';
import * as env from '../server/systems/environment.js';
import * as jobs from '../server/systems/jobs.js';

test('chaos: 24 random players for 4 in-game minutes without a single system error', () => {
  const w = makeWorld({ npcBudget: 500 });
  const r = mulberry32(7);
  const bots = [];
  for (let i = 0; i < 24; i++) {
    const { p, prof } = joinPlayer(w, { cash: 2000, weapons: { fists: 0, pistol: 60, bat: 0, shotgun: 30, rocket: 3 } });
    bots.push({ p, prof, seq: 0, heading: r() * 6.28 });
  }
  env.startRain(w, 60);
  jobs.spawnDrop(w, 4);
  const BITS = [IN.FIRE, IN.ACTION, IN.VEHICLE, IN.SPRINT, IN.DIVE, IN.THROW, IN.RELOAD, IN.HORN, IN.USE, IN.NEXTW];
  for (let t = 0; t < 20 * 240; t++) {
    for (const b of bots) {
      if (r() < 0.03) b.heading += (r() - 0.5) * 3;
      let bits = IN.AIMING;
      for (const k of BITS) if (r() < (k === IN.FIRE ? 0.08 : 0.02)) bits |= k;
      players.queueInput(b.p, { seq: ++b.seq, bits, mx: Math.cos(b.heading), my: Math.sin(b.heading), aim: r() * 6.28 });
      if (r() < 0.0005) law.addHeat(w, b.p, 40, b.p.ped?.x || 0, b.p.ped?.y || 0);
      if (r() < 0.0003 && b.p.conn) players.leave(w, b.p);
    }
    if (t === 20 * 100) w.loopTime = 905; // night
    w.step();
  }
  assert.ok(w.entities.size > 50);
  assert.equal(w.errorCounts?.size || 0, 0);
});
