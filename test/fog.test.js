// Fog (task #387): some mornings and some nights, the same for everyone - the server counts the days (world.js day,
// in the welcome; the clients count the turns of the clock on from there) and client/render/atmos.js fogAt hashes the
// weather from them - eased in and out, never switching mid-night. (The art v2 fog itself is drawn in layers:
// lightgame.js SHAFT_FS / FINAL_FS.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { command } from '../server/dev.js';
import { fogAt } from '../client/render/atmos.js';
import { gameClock, DAY_LOOP_S } from '../shared/constants.js';

test('the server counts the days: one on at each turn of the loop (06:00), and when the clock is set back past it', () => {
  const w = makeWorld({ loopStart: DAY_LOOP_S - 2, day: 41 });
  run(w, 1);
  assert.equal(w.day, 41);
  run(w, 2);
  assert.equal(w.day, 42, 'the loop turned');
  assert.ok(w.loopTime < 2);
  const { p } = joinPlayer(w);
  command(w, p, 'time', { m: 1300 });   // (forward to the evening: the same day)
  assert.equal(w.day, 42);
  command(w, p, 'time', { m: 420 });    // (back to the morning: the next)
  assert.equal(w.day, 43);
  assert.ok(new Date().getFullYear() >= 2026 && makeWorld().day > 1e6, 'a fresh server starts from the wall clock, not day 0');
});

// the clock as a client has it: the server's day x the loop + loopTime
const at = (day, loopTime) => { const lt = day * DAY_LOOP_S + loopTime; return fogAt(lt, gameClock(loopTime).minutes).k; };

test('foggy mornings and misty nights come some days, not every day or never', () => {
  let mornings = 0, nights = 0;
  const D = 400;
  for (let d = 1000; d < 1000 + D; d++) {
    if (at(d, 40) > 0.2) mornings++;                  // (06:40)
    if (at(d, 1050) > 0.2) nights++;                  // (01:30)
  }
  assert.ok(mornings / D > 0.28 && mornings / D < 0.48, `foggy mornings ${(mornings / D * 100).toFixed(0)}% (38% meant)`);
  assert.ok(nights / D > 0.14 && nights / D < 0.3, `misty nights ${(nights / D * 100).toFixed(0)}% (22% meant; it was every night)`);
});

test('the fog comes and goes smoothly: never switching mid-night, at the turn of the loop or at 05:00', () => {
  for (let d = 2000; d < 2060; d++) {
    let prev = at(d, 0), worst = 0, where = 0;
    for (let s = 0.5; s <= DAY_LOOP_S * 2; s += 0.5) {   // (two days, across the turn of the loop)
      const k = at(d + Math.floor(s / DAY_LOOP_S), s % DAY_LOOP_S);
      if (Math.abs(k - prev) > worst) { worst = Math.abs(k - prev); where = s; }
      prev = k;
    }
    // (a foggy morning rolls in over a minute or so: under 0.03 a half second; the old night mist cut off at 05:00 by 0.45)
    assert.ok(worst < 0.03, `day ${d}: the fog jumps by ${worst.toFixed(3)} in half a second at ${gameClock(where % DAY_LOOP_S).minutes.toFixed(0)} min`);
  }
});
