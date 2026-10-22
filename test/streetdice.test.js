// Street dice (the owner's gambling list: "back-alley dice" - server/systems/streetdice.js, activities.js 'dice'): a crew
// shooting dice down an alley in a rough part of town; get in on it for $20 a roll, craps' pass line, even money; clean
// them out and they pack it in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { DICE } from '../shared/rules.js';
import { mulberry32 } from '../shared/rng.js';
import * as dice from '../server/systems/streetdice.js';
import * as activities from '../server/systems/activities.js';

const seq = (a) => { let i = 0; return () => a[i++]; };

test('the pass line: 7 or 11 wins, craps loses, a point made wins, a seven out loses; fair odds', () => {
  assert.equal(dice.passLine(seq([7])).win, true);
  assert.equal(dice.passLine(seq([11])).win, true);
  for (const c of [2, 3, 12]) assert.equal(dice.passLine(seq([c])).win, false);
  const made = dice.passLine(seq([4, 9, 6, 4]));
  assert.ok(made.win && made.point === 4 && made.rolls.length === 4);
  const out = dice.passLine(seq([8, 5, 7]));
  assert.ok(!out.win && out.point === 8);
  const r = mulberry32(99), d = () => 1 + Math.floor(r() * 6);
  let w = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) if (dice.passLine(() => d() + d()).win) w++;
  assert.ok(Math.abs(w / N - 244 / 495) < 0.006, `about 49.3% (${(100 * w / N).toFixed(1)}%)`);
});

test('a crew down an alley: spots in the rough parts of town; get in on it, win or lose $20 a roll; cleaned out, they pack it in', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 500, bank: 0 });
  const spots = activities.spotsOf(w.map).list.filter((s) => s.k === 'dice');
  assert.ok(spots.length > 0, 'dice spots down the alleys');
  const s = spots[0];
  teleport(w, p.ped, s.x + 2000, s.y);
  assert.ok(activities.fill(w, s, { seen: true }), 'the crew there');
  const g = w.acts.get(s.id);
  assert.equal(g.ids.length, 3);
  const shooter = w.get(g.ids[0]);
  assert.equal(shooter.pp, 'dice', 'the dice at the shooter\'s feet');
  assert.equal(shooter.gt, 'kneel');
  teleport(w, p.ped, s.x + s.ix * 30, s.y + s.iy * 30);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Shoot dice/.test(act.label), act && act.label);
  dice.seed(5);
  let rolls = 0;
  for (let i = 0; i < 6; i++) {
    const c0 = p.profile.cash, pot0 = g.dicePot;
    p.diceAt = -99;
    players.findInteraction(w, p).run();
    const d = p.profile.cash - c0;
    assert.ok(d === DICE.bet || d === -DICE.bet, `even money (${d})`);
    assert.equal(g.dicePot - pot0, -d, 'the crew\'s money the other way');
    rolls++;
    if (!w.acts.get(s.id) || g.ids.length < 3 || g.ids.some((id) => !w.get(id)?.npc?.act)) break;   // (a sore loser)
  }
  assert.ok(rolls >= 1);
  // too little cash on you
  if (g.ids.length === 3 && g.ids.every((id) => w.get(id)?.npc?.act)) {
    const cash = p.profile.cash;
    p.profile.cash = 5; p.diceAt = -99;
    players.findInteraction(w, p).run();
    assert.equal(p.profile.cash, 5, 'cash on the street');
    p.profile.cash = cash;
    // cleaned out
    g.dicePot = 0; p.diceAt = -99;
    players.findInteraction(w, p).run();
    assert.ok(g.ids.length === 0 && !shooter.npc.act && !shooter.pp && !shooter.gt, 'packed up, the dice put away');
    assert.ok(p.toasts.some((t) => /cleaned out/.test(t.text)));
  }
});
