// Golf at Cedar Hills Golf Club: teeing off, the swing (hold the attack button, let go: the meter), the ball's flight
// and roll by the lie, the cup, penalties, the score against par, giving a hole up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { IN } from '../shared/input.js';
import { DT } from '../shared/constants.js';
import { GOLF_FEE, HOLE_IN_ONE_PRIZE, CLUBS, LIES, swingMeter, lieAt, clubFor, launchSpeed, carry, SWING_S } from '../shared/golf.js';
import * as golf from '../server/systems/golf.js';

// a swing: press the attack button by the ball, hold it while the meter rises to `power`, let go - through the input
// queue, one input a tick, as the game does it
function swing(w, p, aim, power) {
  const ticks = Math.round(power * SWING_S / DT);
  let seq = p.ack;
  const q = (bits) => { players.queueInput(p, { seq: ++seq, bits, mx: 0, my: 0, aim }); w.step(); };
  for (let i = 0; i <= ticks; i++) q(IN.FIRE | IN.AIMING);
  q(0);
}
const ballOf = (w, p) => w.get(p.golf.ball);
const toPin = (b, h) => Math.atan2(h.pin.y - b.y, h.pin.x - b.x);
// let the ball come to rest (or drop)
function settle(w, p, s = 12) { for (let t = 0; t < s && p.golf && !ballOf(w, p).rest; t += 0.5) run(w, 0.5); }

test('the course: three holes with tees, pins and pars; the lies; the clubs by lie and distance; the meter', () => {
  const w = makeWorld(), g = w.map.golf;
  assert.ok(g && g.holes.length === 3, 'three holes');
  for (const h of g.holes) {
    assert.equal(lieAt(w.map, h.tee.x, h.tee.y), 'tee', `hole ${h.n}: the tee`);
    assert.equal(lieAt(w.map, h.pin.x, h.pin.y), 'green', `hole ${h.n}: the pin on the green`);
    assert.ok(h.par >= 3 && h.par <= 5, `hole ${h.n}: par ${h.par}`);
    const d = Math.hypot(h.pin.x - h.tee.x, h.pin.y - h.tee.y);
    assert.ok(d > carry('driver', 1) * 0.6 && (h.par === 3 ? d < carry('driver', 1) * 1.25 : d > carry('driver', 1) * 1.3), `hole ${h.n}: a fair length for par ${h.par} (${Math.round(d)} px)`);   // (a par 3 with a drive and its roll; a par 4 takes two)
  }
  assert.ok(Object.values(LIES).length >= 6 && lieAt(w.map, g.rect.x0 - 50, g.rect.y0 + 50) === 'out', 'off the course is out');
  assert.equal(clubFor('tee', 800), 'driver'); assert.equal(clubFor('rough', 500), 'iron'); assert.equal(clubFor('fairway', 200), 'wedge');
  assert.equal(clubFor('sand', 200), 'sand'); assert.equal(clubFor('sand', 500), 'iron'); assert.equal(clubFor('green', 50), 'putter');
  assert.equal(swingMeter(0), 0); assert.equal(swingMeter(SWING_S), 1); assert.ok(Math.abs(swingMeter(SWING_S * 1.5) - 0.5) < 1e-9, 'back down after the top');
  assert.ok(launchSpeed('driver', 1) === CLUBS.driver.max && launchSpeed('driver', 0) > 0, 'a full swing is the club\'s full speed');
});

test('golf: tee off ($5), drive down the fairway with the meter, and the ball comes to rest on the course; the prompt and the HUD follow', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 50, bank: 0 });
  const h = w.map.golf.holes[0];
  teleport(w, p.ped, h.tee.x - 20, h.tee.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && act.label.includes(`Tee off - hole 1, par ${h.par} ($${GOLF_FEE})`), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(p.profile.cash, 50 - GOLF_FEE, 'the green fee');
  const b = ballOf(w, p);
  assert.ok(b && b.ballKind === 'golf' && b.rest, 'a ball on the tee');
  const pr = players.findInteraction(w, p);
  assert.ok(pr.key === 'CLICK' && /Driver/.test(pr.label), `by the ball: the swing prompt (${pr.label})`);
  const me = players.buildMe(w, p);
  assert.ok(me.golf && me.golf.n === 1 && me.golf.near && /Hole 1/.test(me.job.text), 'the HUD');
  // a half swing at the flag: the ball flies, lands and rolls a way down the hole (no punch thrown)
  const x0 = b.x, y0 = b.y;
  swing(w, p, toPin(b, h), 0.75);
  assert.equal(p.golf.strokes, 1, 'one stroke');
  assert.ok(!ballOf(w, p).rest, 'it\'s away');
  assert.ok(p.ped.attackAnimUntil === undefined || p.ped.attackAnimUntil < w.time, 'no punch');
  settle(w, p);
  const b2 = ballOf(w, p);
  assert.ok(b2.rest, 'it stopped');
  const gone = Math.hypot(b2.x - x0, b2.y - y0);
  assert.ok(gone > carry('driver', 0.75) * 0.8, `a good way (${Math.round(gone)} px)`);
  assert.ok(Math.hypot(h.pin.x - b2.x, h.pin.y - b2.y) < Math.hypot(h.pin.x - x0, h.pin.y - y0), 'toward the flag');
  assert.ok(['fairway', 'rough', 'sand', 'green', 'path'].includes(p.golf.lie), `lies ${p.golf.lie}`);
  // walking off the course a while gives the hole up and takes the ball away
  teleport(w, p.ped, b2.x + 3000, b2.y);
  run(w, 26);
  assert.equal(p.golf, null, 'hole given up');
  assert.ok(!w.get(b2.id), 'the ball is gone');
});

test('golf: putting - the ball drops in the cup when it rolls over it slowly; a hole in one pays the prize; your best is kept', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 20 });
  const h = w.map.golf.holes[2];
  teleport(w, p.ped, h.tee.x, h.tee.y);
  golf.teeOff(w, p, 3);
  // (the ball moved onto the green, 3 m short of the pin: one putt is a hole in one)
  const b = ballOf(w, p);
  b.x = h.pin.x - 96; b.y = h.pin.y; teleport(w, p.ped, b.x - 20, b.y + 6);
  assert.equal(lieAt(w.map, b.x, b.y), 'green');
  run(w, 0.2);
  assert.ok(/Putter/.test(players.findInteraction(w, p).label), 'the putter on the green');
  // too hard: it races over the cup
  const cash0 = p.profile.cash;
  swing(w, p, toPin(b, h), 1);
  settle(w, p);
  assert.ok(p.golf && p.golf.strokes === 1, 'lipped out: still playing');
  // (back to 3 m short) a putt just firm enough: in
  const b2 = ballOf(w, p);
  b2.x = h.pin.x - 96; b2.y = h.pin.y; b2.rest = true; teleport(w, p.ped, b2.x - 20, b2.y + 6);
  p.golf.strokes = 0;
  const need = Math.sqrt(2 * LIES.green.roll * 110), power = (need / CLUBS.putter.max - 0.12) / 0.88;   // (dying at the hole: past it by a few px)
  swing(w, p, 0, power);
  settle(w, p);
  assert.equal(p.golf, null, 'holed');
  assert.ok(!w.get(b2.id), 'the ball is out of play');
  assert.equal(p.profile.cash, cash0 + HOLE_IN_ONE_PRIZE, 'the hole-in-one prize');
  assert.equal(p.profile.golfBest[3], 1, 'your best on the hole');
});

test('golf: into the pond or out of bounds costs a stroke and the ball comes back where you hit it from', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 20 });
  const pond = w.map.natureSites.find((q) => q.kind === 'golf').pond, rect = w.map.golf.rect;
  const h = w.map.golf.holes[1];
  teleport(w, p.ped, h.tee.x, h.tee.y);
  golf.teeOff(w, p, 2);
  const b = ballOf(w, p);
  // a shot that comes down in the middle of the pond
  swing(w, p, toPin(b, h), 0.3);
  const from = { ...p.golf.from };
  Object.assign(b, { x: pond.x, y: pond.y, z: 30, vz: -50, vx: 10, vy: 0, rest: false });
  assert.equal(lieAt(w.map, pond.x, pond.y), 'water');
  settle(w, p);
  assert.equal(p.golf.strokes, 2, 'the shot and a penalty');
  assert.ok(b.rest && Math.hypot(b.x - from.x, b.y - from.y) < 1, 'back where it was hit from');
  // one that rolls off the course
  swing(w, p, toPin(b, h), 0.2);
  const from2 = { ...p.golf.from };
  Object.assign(b, { x: rect.x0 + 6, y: (rect.y0 + rect.y1) / 2, z: 0, vz: 0, vx: -200, vy: 0, rest: false });
  settle(w, p);
  assert.equal(p.golf.strokes, 4, 'another shot and another penalty');
  assert.ok(Math.hypot(b.x - from2.x, b.y - from2.y) < 1, 'back again');
});
