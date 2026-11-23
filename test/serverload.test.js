// The server's per-player work (11-17: at 100 bots on World v3 the 'players' system - every player's prompt,
// findInteraction, five times a second - took 0.5 ms a player a tick, most of it walking the whole list of places a
// dozen times a prompt). tools/playersbench.mjs measures it; here, on today's world: the prompts never walk the places'
// list once warmed up (server/pois.js: a grid and the lists made once), poiAt finds what CityMap.poiNear finds, and a
// tick of 100 players' prompts stays in a budget measured against the CPU yardstick (tools/perf.mjs).
import { makeWorld, store, players } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world.js';
import { poiAt, poisKind } from '../server/pois.js';
import { benchPlayers } from '../tools/playersbench.mjs';
import { yardstick } from '../tools/perf.mjs';

// 'players' a tick for 100 walking players, in yardsticks (measured 11-17: about 0.016 - 2.6 ms against a 164 ms
// yardstick; before server/pois.js 0.04, and on World v3 0.25)
const PLAYERS_X = 0.035;

test('poiAt finds the place CityMap.poiNear finds, anywhere; the kinds\' lists are the map\'s', () => {
  const m = makeWorld().map;
  let s = 99;
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const W = m.frame.w * 32, H = m.frame.h * 32;
  let hits = 0;
  for (let i = 0; i < 20000; i++) {
    const q = m.pois[Math.floor(rnd() * m.pois.length)];
    // half by the places (inside their circles and just past them), half anywhere
    const x = i & 1 ? q.x + (rnd() - 0.5) * 2.4 * q.r : rnd() * W, y = i & 1 ? q.y + (rnd() - 0.5) * 2.4 * q.r : rnd() * H;
    const want = m.poiNear(x, y), got = poiAt(m, x, y);
    assert.equal(got, want, `at ${x}, ${y}`);
    if (want) hits++;
    if (i % 7 === 0) assert.equal(poiAt(m, x, y, q.kind), m.poiNear(x, y, q.kind));
  }
  assert.ok(hits > 5000, `checked at the places too (${hits})`);
  assert.deepEqual(poisKind(m, 'hospital'), m.pois.filter((q) => q.kind === 'hospital'));
  assert.equal(poisKind(m, 'hospital'), poisKind(m, 'hospital'), 'made once');
});

test('100 players\' prompts: the places\' list never walked once warmed up; the tick in its budget', async () => {
  const map = makeWorld().map;
  const real = map.pois;
  let counting = false;
  const walks = new Map();
  const WALK = new Set([Symbol.iterator, 'filter', 'find', 'some', 'map', 'forEach', 'reduce', 'findIndex', 'every', 'flatMap']);
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 60;
  map.pois = new Proxy(real, {
    get(t, k, r) {
      if (counting && WALK.has(k)) {
        const st = new Error().stack;
        if (st.includes('findInteraction')) { const at = st.split('\n')[2].trim(); walks.set(at, (walks.get(at) || 0) + 1); }
      }
      return Reflect.get(t, k, r);
    },
  });
  try {
    await benchPlayers(map, { n: 100, seconds: 2, warmS: 6, World, players, store, warmed: () => { counting = true; } });
  } finally { map.pois = real; Error.stackTraceLimit = limit; }
  assert.deepEqual([...walks], [], 'a prompt walked every place on the map (use server/pois.js)');
  // the time, without the counting: the best of two runs, against the yardstick
  const yard = yardstick();
  let best = Infinity;
  for (let i = 0; i < 2; i++) best = Math.min(best, (await benchPlayers(map, { n: 100, seconds: 3, warmS: 4, seed: 11 + i, World, players, store })).ms.players);
  assert.ok(best <= PLAYERS_X * yard, `'players' ${best.toFixed(2)} ms a tick for 100 players, over its budget ${(PLAYERS_X * yard).toFixed(2)} ms (${PLAYERS_X} yardsticks of ${yard.toFixed(0)} ms) - node tools/playersbench.mjs`);
});
