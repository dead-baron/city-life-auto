// No knotted junctions (the owner, 11-14: "Looks like traffic jams are still happening" - a city four-way knotted solid:
// a box truck, a delivery van, a dump truck, a bus and cars wedged across it at all angles, nobody able to move).
// World v3, headless, as the server runs it (the heavy lock: one build, about two minutes and 2 GB): the busy four-way
// nearest Midtown station, with lights and without, fed a heavy mix (the trucks and buses three times as often) for ten
// in-game minutes, a player at the corner (nothing cleared away out of sight) - it keeps flowing, nothing stands still
// in the box or at the head of a queue 30 s; and the owner's knot built in the box clears in about 20 s
// (test/gridlocksim.js; the numbers: tools/gridlocksim.mjs; server/systems/junctionbox.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPlayer, teleport } from './helpers.js';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { TILE } from '../shared/constants.js';
import { MAIN_STATIONS3 } from '../shared/world3-layout.js';
import { runFourWay, findFourWay, buildKnot } from './gridlocksim.js';
import { boxR } from '../server/systems/junctionbox.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const st = MAIN_STATIONS3.find((q) => q.name === 'Midtown');
const near = { nearX: st.at[0] * TILE, nearY: st.at[1] * TILE };

for (const lights of [true, false]) {
  test(`a busy four-way ${lights ? 'with lights' : 'without lights'} keeps flowing for ten minutes: nothing stands still at the head of a queue 30 s`, { timeout: 900000 }, () => {
    const r = runFourWay(M, { lights, seed: 7, minutes: 10, ...near });
    const msg = JSON.stringify({ ...r, world: undefined });
    // (in the box and at the head of each queue - the box's own doing: a queue further back up a road, or one held for
    // room on its way out, or behind an ambulance at work, waits whatever the junction does)
    assert.ok(r.maxBox <= 30, `the longest anything stood still in the box: ${r.maxBox} s (${msg})`);
    assert.ok(r.maxJam <= 30, `the longest anything stood stuck in the box or at the head of a queue (not held for room out, nor behind a police car or an ambulance at work, nor at a red): ${r.maxJam} s (${msg})`);
    assert.ok(r.perMin >= 18, `through it: ${r.perMin} a minute (${msg})`);
  });
}

test('the owner\'s knot - long vehicles in the box turning across each other, queues behind - clears in about 20 s', { timeout: 300000 }, () => {
  for (const lights of [false, true]) {
    const w = new World(M, { npcBudget: 0, throwErrors: true }), n = findFourWay(M, { lights, ...near });
    const { p } = joinPlayer(w);
    teleport(w, p.ped, n.x + boxR(n) + 140, n.y + boxR(n) + 140);   // (watching: nothing's cleared away out of sight)
    p.ped.protectUntil = 1e9;
    const { knot, queue } = buildKnot(w, n);
    assert.ok(knot.length >= 4 && knot.filter((v) => v.def.L >= 120).length >= 2 && queue.length >= 6, `the knot (${knot.map((v) => v.model)}; ${queue.length} queued)`);
    const out = (v) => !w.get(v.id) || Math.hypot(v.x - n.x, v.y - n.y) > boxR(n) + v.def.L / 2;
    let t = 0;
    for (; t < 40 * 20 && !knot.every(out); t++) w.step();
    assert.ok(knot.every(out) && t / 20 <= 22, `the box clear in ${(t / 20).toFixed(1)} s${lights ? ' (lights)' : ''} (still in it: ${knot.filter((v) => !out(v)).map((v) => v.model)}; untied ${w.knotsUntied || 0}, realigned ${w.realigned || 0})`);
    assert.ok(knot.every((v) => w.get(v.id)), 'nobody cleared away: they drove out');
  }
});
