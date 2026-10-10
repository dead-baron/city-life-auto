// Pinwheel Lanes (shared/bowling.js, server/systems/bowling.js): the score card, the pins falling from the ball's line
// and speed, the alley on the map, renting a lane, rolling, a friend joining, the NPC groups on the other lanes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { IN } from '../shared/input.js';
import { DT, T, TILE } from '../shared/constants.js';
import { SWING_S } from '../shared/golf.js';
import { BOWL, ALL_PINS, scoreCard, totalScore, nextBall, knockPins, rollBall, pinCount, alleyLanes, approachAt, lanePt } from '../shared/bowling.js';
import * as bowling from '../server/systems/bowling.js';

const left = (mask) => { const up = []; for (let i = 0; i < 10; i++) if (!(mask & (1 << i))) up.push(i + 1); return up; };

test('the score card: strikes and spares count the next balls, the tenth frame\'s bonus balls, a perfect game', () => {
  assert.equal(totalScore(Array(12).fill(10)), 300, 'twelve strikes');
  assert.equal(totalScore(Array(20).fill(0)), 0, 'a gutter game');
  assert.equal(totalScore(Array(21).fill(5)), 150, 'all spares, a five each time');
  const c = scoreCard([9, 1, 10, 7, 2, 0, 0, 10, 10, 3, 7, 8, 1, 10, 6, 4, 10]);
  assert.deepEqual(c.frames.map((f) => f.total), [20, 39, 48, 48, 71, 91, 109, 118, 138, 158]);
  assert.deepEqual(c.frames[0].marks, ['9', '/']);
  assert.deepEqual(c.frames[3].marks, ['-', '-']);
  assert.deepEqual(c.frames[9].marks, ['6', '/', 'X']);
  assert.ok(c.done, 'the game is over');
  // a strike waits for its two balls before it counts
  const s = scoreCard([10, 3]);
  assert.equal(s.frames[0].total, null, 'not yet');
  assert.deepEqual(nextBall([10, 3]), { frame: 1, ball: 1, done: false, up: 7 }, 'the second ball at the seven left standing');
  assert.deepEqual(scoreCard([10, 3, 4]).frames.slice(0, 2).map((f) => f.total), [17, 24]);
  // the tenth: a strike gives two more balls, an open frame none
  const nine = Array(18).fill(0);
  assert.equal(nextBall([...nine, 10]).done, false);
  assert.deepEqual(nextBall([...nine, 10, 10]), { frame: 9, ball: 2, done: false, up: 10 });
  assert.deepEqual(scoreCard([...nine, 10, 10, 10]).frames[9].marks, ['X', 'X', 'X']);
  assert.deepEqual(scoreCard([...nine, 10, 7, 3]).frames[9].marks, ['X', '7', '/']);
  assert.equal(nextBall([...nine, 3, 4]).done, true, 'an open tenth: no bonus ball');
});

test('the pins fall from the ball\'s line and speed: the pocket strikes, a gutter ball takes none, never random', () => {
  // the same roll, the same pins
  assert.deepEqual(knockPins(ALL_PINS, 2.3, -0.06, 380), knockPins(ALL_PINS, 2.3, -0.06, 380), 'deterministic');
  // into the pocket (between the 1 and the 3) at a good speed, coming back in: a strike
  assert.equal(knockPins(ALL_PINS, 2, -0.06, 360).down, ALL_PINS, 'a strike in the pocket');
  // straight down the middle, slow: pins left standing
  const flat = knockPins(ALL_PINS, 0, 0, 160);
  assert.ok(pinCount(flat.down) >= 5 && pinCount(flat.down) < 10, `head-on and slow leaves some (${left(flat.down)})`);
  // out by the edge: the head pin stands
  const thin = knockPins(ALL_PINS, 8, 0, 300);
  assert.ok(!(thin.down & 1) && !(thin.down & (1 << 6)) && pinCount(thin.down) < 10, `a thin hit on the right: the head pin and the 7 stand (${left(thin.down)})`);
  // a spare: only the pins still up can fall
  const leave = 1 << 9;   // (the 10 pin)
  assert.equal(knockPins(leave, 0, 0, 300).down, 0, 'down the middle misses the 10 pin');
  assert.equal(knockPins(leave, 13, 0, 300).down, leave, 'along the right edge it takes it');
  // a gutter ball drops off the lane and takes nothing
  const lane = alleyLanes({ south: true, x0: 10, x1: 21, y0: 10, y1: 20 })[0];
  const g = rollBall(lane, 12, 0.2, 0.8, 0);
  assert.ok(g.gutter, 'off the edge into the gutter');
  // the hook curls the ball toward its side late on the lane
  const st = rollBall(lane, 0, 0, 0.6, 0), hk = rollBall(lane, 0, 0, 0.6, -1);
  assert.ok(Math.abs(st.entry.u) < 0.01 && hk.entry.u < -2 && hk.entry.slope < 0, 'the hook bends it left');
  assert.ok(rollBall(lane, 0, 0, 1, 0).speed > rollBall(lane, 0, 0, 0.2, 0).speed, 'power is speed');
});

test('Pinwheel Lanes on the map: a walk-in with eight lanes, the approach to stand on, the lanes off limits, the counter', () => {
  const w = makeWorld(), m = w.map, A = m.bowling;
  assert.ok(A && A.lanes.length === BOWL.LANES, 'eight lanes');
  const b = m.buildings[A.b], poi = m.pois.find((q) => q.id === A.poi);
  assert.equal(poi.kind, 'bowling');
  assert.ok(b.walkIn && m.walkIns.includes(b.id) && b.walkIn.units[0].kind === 'bowling', 'a walk-in');
  assert.ok(A.district, `in a district (${A.district})`);
  for (const L of A.lanes) {
    assert.ok(L.ax >= (b.walkIn.x0) * TILE && L.ax + BOWL.PITCH <= (b.walkIn.x1 + 1) * TILE, `lane ${L.i + 1} inside`);
    const mid = lanePt(L, 0, L.len / 2), app = lanePt(L, 0, -TILE);
    assert.equal(m.tileAtPx(mid.x, mid.y), T.COUNTER, 'nobody walks down a lane');
    assert.equal(m.tileAtPx(app.x, app.y), T.FLOOR, 'the approach is floor');
    assert.equal(approachAt(A, app.x, app.y), L.i, 'standing on its approach');
  }
  assert.equal(m.tileAtPx(A.counter.x, A.counter.y), T.FLOOR, 'in front of the counter');
});

function rollAt(w, p, power) {
  const ticks = Math.round(power * SWING_S / DT);
  let seq = p.ack;
  const q = (bits) => { players.queueInput(p, { seq: ++seq, bits, mx: 0, my: 0, aim: p.ped.a }); w.step(); };
  for (let i = 0; i <= ticks; i++) q(IN.FIRE | IN.AIMING);
  q(0);
}

test('renting a lane: pay at the counter, pick up a ball, roll; the card fills, a friend joins and takes turns', () => {
  const w = makeWorld(), A = w.map.bowling;
  const { p } = joinPlayer(w, { cash: 100 });
  teleport(w, p.ped, A.counter.x, A.counter.y);
  let act = players.findInteraction(w, p);
  assert.ok(act && /Rent a lane/.test(act.label), `the counter (${act && act.label})`);
  act.run();
  assert.ok(p.bowl, 'a lane');
  assert.equal(p.profile.cash, 100 - BOWL.FEE, 'paid');
  const L = A.lanes[p.bowl.lane], spot = lanePt(L, 0, -20);
  teleport(w, p.ped, spot.x, spot.y);
  p.ped.a = L.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  act = players.findInteraction(w, p);
  assert.ok(/Pick up a ball/.test(act.label), act.label);
  act.run();
  assert.ok(/Hook/.test(players.findInteraction(w, p).label), 'the hook to pick');
  rollAt(w, p, 0.7);
  assert.ok([...w.entities.values()].some((e) => e.ballKind === 'bowl'), 'the ball rolls');
  run(w, 3);
  const me = players.buildMe(w, p);
  assert.ok(me.bowl && me.bowl.card[0].rolls.length === 1, 'the first ball on the card');
  assert.ok(/Bowling, lane/.test(me.job.text), 'the HUD tracker');
  // a friend joins the lane
  const { p: q } = joinPlayer(w, { cash: 50 });
  const spot2 = lanePt(L, 10, -24);
  teleport(w, q.ped, spot2.x, spot2.y);
  act = players.findInteraction(w, q);
  assert.ok(/Join this lane/.test(act.label), act.label);
  act.run();
  assert.equal(q.bowl.lane, p.bowl.lane, 'same lane');
  // finish the first player's frame (a second ball unless it was a strike), then it's the friend's turn
  const card = () => bowling.meInfo(w, p).card;
  if (card()[0].rolls[0] !== 10) {
    players.findInteraction(w, p).run();
    rollAt(w, p, 0.5); run(w, 3);
  }
  const mi = bowling.meInfo(w, q);
  assert.ok(mi.mine, 'the friend\'s turn');
  assert.ok(/turn/.test(players.findInteraction(w, p).label), 'the first player waits');
  // walking out ends your game
  teleport(w, p.ped, A.counter.x + 3000, A.counter.y); run(w, 0.2);
  assert.equal(p.bowl, null, 'shoes handed back');
  assert.equal(bowling.meInfo(w, q).card.length, 1, 'the friend bowls on');
});

test('NPC groups bowl on the other lanes while someone is near, and go when nobody is', () => {
  const w = makeWorld(), A = w.map.bowling;
  const { p } = joinPlayer(w);
  teleport(w, p.ped, A.counter.x, A.counter.y);
  run(w, 2);
  const npcLanes = w.bowl.lanes.filter((l) => l.game && l.game.npc);
  assert.ok(npcLanes.length >= 2, 'groups on the lanes');
  run(w, 14);
  assert.ok(npcLanes.some((l) => l.game && l.game.bowlers.some((b) => b.rolls.length)), 'they bowl');
  teleport(w, p.ped, A.counter.x + 4000, A.counter.y); run(w, 2);
  assert.ok(!w.bowl.lanes.some((l) => l.game && l.game.npc), 'gone when nobody is near');
});
