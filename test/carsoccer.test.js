// Car soccer (the owner, 10-16: "Rocket League-style car soccer arena (boosts, banked walls, a giant ball)" -
// shared/carsoccer.js, server/systems/carsoccer.js, client/carsoccer.js): the arena's shape, the ball's physics off the
// banks, the walls, the posts and into the goals, a car's push; the banks and the boost in every vehicle step (the
// page's prediction the same); a match from the gate to full time - kick-offs, goals, the replay, overtime, the prize,
// everyone out at the gate; leaving mid-match; no harm and no crime in there; the page's word. World v3's arena by the
// stadium: test/world3server.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { T, K } from '../shared/constants.js';
import { CARSOCCER as C } from '../shared/rules-games.js';
import { arenaOf, arenaTile, bankRamps, bankAt, groundZ, stepBall, newBall, carOf, carStep, local, padAt } from '../shared/carsoccer.js';
import { vehStep, driveInput, newVehState } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { IN } from '../shared/input.js';
import * as soc from '../server/systems/carsoccer.js';
import * as players from '../server/systems/players.js';
import * as vehicles from '../server/systems/vehicles.js';

// an arena laid on the test city where there's room (nothing built there)
function withArena(w) {
  const m = w.map;
  if (m.arenas && m.arenas.length) return m.arenas[0];
  const ok = (t) => t !== T.BUILDING && t !== T.WATER && t !== T.DEEP && t !== T.FLOOR && t !== T.COUNTER && t !== T.BRIDGE;
  let at = null;
  for (let ty = m.y0 + 4; ty < m.y0 + m.h - 40 && !at; ty += 4) row: for (let tx = m.x0 + 4; tx < m.x0 + m.w - 60; tx += 4) {
    for (let y = ty - 1; y < ty + 37; y++) for (let x = tx - 2; x < tx + 56; x++) if (!ok(m.tileAt(x, y)) || m.bld[m.idx(x, y)] >= 0) continue row;
    at = [tx, ty]; break;
  }
  const a = arenaOf(at[0], at[1], 56, 36, 'Test Arena');
  for (let y = at[1]; y < at[1] + 36; y++) for (let x = at[0]; x < at[0] + 56; x++) { m.tiles[m.idx(x, y)] = arenaTile(a, x, y); m.solidProps.delete(m.idx(x, y)); }   // (the city's lamps and trees off it)
  m.tiles[m.idx(at[0] - 1, Math.floor(a.gate.y / 32))] = T.SIDEWALK;
  m.arenas = [a]; (m.jumps ||= []).push(...bankRamps(a));
  return a;
}
const play = (w, s) => { for (let k = 0; k < s * 20; k++) w.step(); };

test('the arena: walled all round, the goals\' boxes in the end walls, the banks along every wall but across the mouths, the pads and the spots on the pitch', () => {
  const a = arenaOf(100, 100, 56, 36);
  assert.ok(a.ix1 - a.ix0 > 1400 && a.iy1 - a.iy0 > 1000, 'room to play');
  assert.equal(a.my1 - a.my0, C.goalW);
  for (let tx = 100; tx < 156; tx++) { assert.equal(arenaTile(a, tx, 100), T.WALL); assert.equal(arenaTile(a, tx, 135), T.WALL); }
  for (let ty = 100; ty < 136; ty++) { assert.equal(arenaTile(a, 100, ty), T.WALL, 'the back walls'); assert.equal(arenaTile(a, 155, ty), T.WALL); }
  assert.notEqual(arenaTile(a, 101, Math.floor(a.cy / 32)), T.WALL, 'into the west goal\'s box');
  assert.equal(arenaTile(a, 101, Math.floor(a.iy0 / 32) + 1), T.WALL, 'walled either side of it');
  assert.equal(bankAt(a, a.cx, a.cy), 0, 'the middle flat');
  assert.ok(bankAt(a, a.cx, a.iy0 + 4) > 0.9 && bankAt(a, a.ix0 + 4, a.iy0 + 200) > 0.9, 'up the bank at the walls');
  assert.equal(bankAt(a, a.ix0 + 4, a.cy), 0, 'none across a goal\'s mouth');
  assert.ok(groundZ(a, a.cx, a.iy0 + 2) > C.bank.h * 0.9);
  for (const p of a.pads) assert.ok(p.x > a.fx0 && p.x < a.fx1 && p.y > a.fy0 && p.y < a.fy1, 'a pad on the flat');
  assert.ok(a.pads.filter((p) => p.big).length >= 4 && a.pads.filter((p) => !p.big).length >= 6, 'big pads and small ones');
  for (const t of [0, 1]) for (const [x, y] of a.spots[t]) assert.ok((t ? x > a.cx : x < a.cx) && bankAt(a, x, y) === 0, 'each side\'s spots in its own half, on the flat');
  assert.equal(bankRamps(a).length, 6, 'the renderer drawn up the banks: one a side, the ends either side of the mouths');
});

test('the ball: off the walls and the posts, back down the banks, pushed by a car - livelier than the car - and a goal once it\'s all over the line', () => {
  const a = arenaOf(100, 100, 56, 36), dt = 0.025;
  // into the north wall: back off it, kept in
  let b = { ...newBall(a), y: a.iy0 + 200, vy: -900 };
  for (let k = 0; k < 40; k++) stepBall(b, a, dt, []);
  assert.ok(b.vy > 0 || b.y > a.iy0 + C.ball.r, 'bounced off the wall');
  assert.ok(b.y >= a.iy0 + C.ball.r - 0.01, 'never through it');
  // left high on the bank: it rolls back down onto the pitch
  b = { ...newBall(a), x: a.cx, y: a.iy0 + C.ball.r + 2 };
  for (let k = 0; k < 120; k++) stepBall(b, a, dt, []);
  assert.ok(b.y > a.iy0 + C.bank.w * 0.5, `rolled back down the bank (${Math.round(b.y - a.iy0)})`);
  // at the end wall beside the mouth: off the post, no goal
  b = { ...newBall(a), x: a.ix0 + 200, y: a.my0 - 30, vx: -900 };
  let g = 0;
  for (let k = 0; k < 60 && !g; k++) g = stepBall(b, a, dt, []);
  assert.equal(g, 0, 'no goal off the post');
  assert.ok(b.x > a.ix0, 'kept out of the goal');
  // straight into the west goal: a goal for the east end's team; and into the east, the west's
  assert.ok(2 * C.ball.r < a.ix0 - a.gx0, 'the whole ball fits in a goal\'s box');
  for (const [side, want, sp] of [[-1, 1, 1200], [1, 2, 1200], [1, 2, 500]]) {   // (a slow one rolls in too)
    b = { ...newBall(a), x: a.cx + side * 300, y: a.cy, vx: side * sp };
    g = 0;
    for (let k = 0; k < 240 && !g; k++) g = stepBall(b, a, dt / 2, []);
    assert.equal(g, want, `into the ${side < 0 ? 'west' : 'east'} goal at ${sp} px/s`);
  }
  // a car driving into it at rest: shoved on, faster than the car
  b = newBall(a);
  const car = { id: 1, x: a.cx - 120, y: a.cy, a: 0, vx: 500, vy: 0, L: 82, W: 46 };
  let hit = 0;
  for (let k = 0; k < 20; k++) { car.x += car.vx * dt; stepBall(b, a, dt, [car], () => hit++); }
  assert.ok(hit >= 1, 'it touched the ball');
  assert.ok(b.vx > 500, `the ball off it faster than the car (${Math.round(b.vx)})`);
});

test('a car in the arena: the banks pull it back down, the boost pushes it on (the page\'s own step the same), held at a kick-off', () => {
  const w = makeWorld(); const a = withArena(w), def = VEHICLES[C.model], m = w.map;
  // coasting up the north bank: it slows, stops short of the wall and rolls back down
  const s = newVehState(a.cx, a.fy0 + 10, -Math.PI / 2); s.vy = -260;
  let top = s.y;
  for (let k = 0; k < 60; k++) { vehStep(s, { throttle: 0, steer: 0, hb: false }, 0.05, m, def, {}); top = Math.min(top, s.y); }
  assert.ok(top > a.iy0 + def.L / 2 && top < a.fy0, `up the bank, short of the wall (${Math.round(top - a.iy0)})`);
  assert.ok(s.y > top + 20, `and back down it (${Math.round(s.y - top)})`);
  // the boost: with it, faster than without - the server's car (s.arena, s.bok) and the page's (local.bok) alike
  const run = (bok, page) => {
    const q = newVehState(a.cx - 400, a.cy, 0); if (!page) { q.arena = true; q.bok = bok; } else local.bok = bok;
    for (let k = 0; k < 30; k++) vehStep(q, { ...driveInput(q, { bits: IN.SPRINT, mx: 1, my: 0 }, def) }, 0.05, m, def, {});
    local.bok = false;
    return q.x;
  };
  assert.ok(run(true, false) > run(false, false) + 60, 'the boost pushes the server\'s car on');
  assert.ok(Math.abs(run(true, true) - run(true, false)) < 1e-6, 'the page\'s prediction the same');
  // held at a kick-off
  const h = newVehState(a.cx - 300, a.cy, 0); h.arena = true; h.frz = true;
  for (let k = 0; k < 10; k++) vehStep(h, { throttle: 1, steer: 0, hb: false, drv: true }, 0.05, m, def, {});
  assert.ok(Math.abs(h.x - (a.cx - 300)) < 1, 'held on the spot');
  void carStep; void carOf; void padAt;
});

test('a match: joined at the gate, the city\'s drivers fill the sides, kick-off, goals with their replay, full time, the prize, everyone out at the gate', () => {
  const w = makeWorld(); const a = withArena(w);
  const { p, conn, prof } = joinPlayer(w, { cash: 0, bank: 0 });
  teleport(w, p.ped, a.gate.x, a.gate.y);
  const it = players.findInteraction(w, p);
  assert.match(it.label, /Join car soccer/);
  it.run();
  const st = soc._test.stOf(w, 0);
  assert.equal(st.phase, 'lobby');
  assert.match(players.findInteraction(w, p).label, /kick-off in/);
  play(w, C.lobbyS + 0.5);
  assert.equal(st.phase, 'kick', 'kick-off');
  assert.equal(st.slots.length, 2 * C.teamMin, `${C.teamMin} a side`);
  assert.equal(st.slots.filter((s) => s.pid).length, 1, 'you');
  assert.equal(st.slots.filter((s) => s.bot).length, 2 * C.teamMin - 1, 'and the city\'s drivers');
  const mine = st.slots.find((s) => s.pid === p.pid), v = w.get(mine.veh);
  assert.equal(p.ped.vehId, v.id, 'at the wheel of an arena car');
  assert.equal(v.model, C.model);
  assert.ok(v.frz, 'held on the spot');
  assert.match(players.findInteraction(w, p).label, /Car soccer.*boost/, 'what the buttons do');
  const msg = [...conn.sent].reverse().find((q) => q && q.t === 'soc' && q.cars);
  assert.ok(msg && msg.me && msg.me.team === mine.team && Array.isArray(msg.b) && msg.cars.length === 4, 'the page told: the ball, the cars, your side');
  play(w, C.kickS + 0.2);
  assert.equal(st.phase, 'play');
  assert.ok(!v.frz && v.bok, 'off, with boost');
  // a goal for your side: the ball into the goal you attack (team 0 the east, team 1 the west)
  const east = mine.team === 0;
  Object.assign(st.ball, { x: east ? a.ix1 - 80 : a.ix0 + 80, y: a.cy, z: 0, vx: east ? 1200 : -1200, vy: 0, vz: 0 });
  st.last = { team: mine.team, name: p.name };
  play(w, 0.5);
  assert.equal(st.score[mine.team], 1, 'a goal');
  assert.equal(st.phase, 'goal');
  assert.ok(st.rp && st.rp.length > 5, 'the replay: the ball\'s last seconds');
  const gm = [...conn.sent].reverse().find((q) => q && q.t === 'soc' && q.goal);
  assert.ok(gm && gm.goal.who === p.name && gm.rp.length > 5, 'the page told who, and the replay');
  play(w, C.goalS + 0.2);
  assert.equal(st.phase, 'kick', 'kick-off again');
  assert.ok(Math.hypot(st.ball.x - a.cx, st.ball.y - a.cy) < 1, 'the ball back in the middle');
  // the clock runs out with your side ahead: full time, the prize
  play(w, C.kickS + 0.2);
  st.clock = 0.05;
  if (st.score[0] === st.score[1]) st.score[mine.team]++;
  st.score[1 - mine.team] = Math.min(st.score[1 - mine.team], st.score[mine.team] - 1);
  play(w, 0.2);
  assert.equal(st.phase, 'over', 'full time');
  assert.equal(prof.bank, C.prize, 'the prize in your bank');
  play(w, C.overS + 0.3);
  assert.equal(st.phase, 'idle');
  assert.equal(p.ped.vehId, 0, 'out of the car');
  assert.ok(Math.hypot(p.ped.x - a.gate.x, p.ped.y - a.gate.y) < 100, 'at the gate');
  assert.equal([...w.entities.values()].filter((e) => e.kind === K.VEH && e.arena).length, 0, 'the arena cars gone');
  assert.equal([...w.entities.values()].filter((e) => e.kind === K.PED && e.npc && e.npc.soccer).length, 0, 'and their drivers');
});

test('overtime: a draw at full time plays on - the next goal wins; leaving mid-match puts you at the gate and a driver in your car; no harm, no crime', () => {
  const w = makeWorld(); const a = withArena(w);
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 0 });
  soc.devStart(w, p, {});
  const st = soc._test.stOf(w, 0);
  play(w, C.kickS + 0.2);
  st.clock = 0.05;
  play(w, 0.2);
  assert.ok(st.ot && st.phase === 'play', 'overtime');
  const mine = st.slots.find((s) => s.pid === p.pid), v = w.get(mine.veh);
  // knocks in the arena: the cars unharmed, nobody wanted
  const other = w.get(st.slots.find((s) => s !== mine).veh);
  vehicles.damageVehicle(w, v, 500, null);
  assert.equal(v.hp, v.def.hp, 'an arena car takes no harm');
  other.x = v.x + 60; other.y = v.y; other.vx = -600; other.a = Math.PI; v.vx = 600;
  play(w, 0.3);
  assert.equal(p.wanted || 0, 0, 'no crime in a bump');
  // a goal against you in overtime: it's over
  const east = mine.team === 0;
  Object.assign(st.ball, { x: east ? a.ix0 + 80 : a.ix1 - 80, y: a.cy, z: 0, vx: east ? -1200 : 1200, vy: 0, vz: 0 });
  play(w, 0.5);
  assert.equal(st.phase, 'goal');
  play(w, C.goalS + 0.2);
  assert.equal(st.phase, 'over', 'the golden goal ends it');
  assert.equal(prof.bank, 0, 'no prize for the losers');
  play(w, C.overS + 0.3);
  // again with a friend, and out with the vehicle button
  const { p: q } = joinPlayer(w, { cash: 0, bank: 0 });
  teleport(w, q.ped, a.gate.x, a.gate.y + 30);
  soc.join(w, q, a);
  soc.devStart(w, p, {});
  play(w, C.kickS + 0.3);
  const s2 = soc._test.stOf(w, 0), m2 = s2.slots.find((s) => s.pid === p.pid), car = w.get(m2.veh);
  assert.equal(s2.slots.filter((s) => s.pid).length, 2, 'both of you in it');
  p.inputQ.push({ seq: p.ack + 1, bits: IN.VEHICLE, mx: 0, my: 0, aim: 0 }); w.step();
  p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 }); w.step();
  assert.equal(p.ped.vehId, 0, 'out of the car');
  assert.ok(Math.hypot(p.ped.x - a.gate.x, p.ped.y - a.gate.y) < 100, 'out at the gate, not in the arena');
  assert.ok(car.seats[0] && w.get(car.seats[0]).npc, 'a driver took the car');
  assert.equal(s2.phase, 'play', 'the match goes on for your friend');
  q.ped.dead = true; play(w, 0.2);
  assert.equal(s2.phase, 'idle', 'nobody playing: the match is off');
});

test('the gate when a match is on, a full lobby; nobody of the city wanders onto the pitch', async () => {
  const w = makeWorld(); const a = withArena(w);
  const { p } = joinPlayer(w, { cash: 0, bank: 0 });
  const { p: q } = joinPlayer(w, { cash: 0, bank: 0 });
  soc.devStart(w, p, {});
  teleport(w, q.ped, a.gate.x, a.gate.y);
  assert.match(players.findInteraction(w, q).label, /a match is on/);
  const npc = await import('../server/systems/npc.js');
  assert.equal(npc.peopleBelongAt(w.map, a.cx, a.cy), false, 'no passers-by spawned on the pitch');
});

test('the page: its own car held at a kick-off and boosting only with boost, from the server\'s word; the ball predicted between words and eased back', async () => {
  const { onMsg } = await import('../client/carsoccer.js');
  const a = arenaOf(100, 100, 56, 36);
  const S = { map: { arenas: [a] }, ents: new Map(), rtt: 100 };
  onMsg(S, { t: 'soc', a: 0, ph: 'kick', tl: 3, pads: 0, me: { team: 0, boost: 34 }, sc: [0, 0], cars: [], b: [a.cx, a.cy, 0, 0, 0, 0, 0] });
  assert.ok(S.soc && local.frz && !local.bok, 'held at the kick-off');
  onMsg(S, { t: 'soc', a: 0, ph: 'play', tl: 170, pads: 0, me: { team: 0, boost: 20 }, b: [a.cx, a.cy, 0, 300, 0, 0, 0] });
  assert.ok(!local.frz && local.bok, 'off, with boost');
  // between the server's words the ball goes on by itself (drawn a frame: no canvas needed for the world, a stub for the HUD)
  const g = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })), set: (o, k, v) => { o[k] = v; return true; } });
  globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
  const x0 = S.soc.ball.x;
  for (let k = 0; k < 8; k++) S.soc.draw(g, { dt: 0.05, z: 1, view: null }, true);
  assert.ok(S.soc.ball.x > x0 + 20, 'the ball rolls on between words');
  onMsg(S, { t: 'soc', a: 0, ph: 'play', tl: 169, pads: 0, me: { team: 0, boost: 0 }, b: [a.cx + 10, a.cy, 0, 300, 0, 0, 0] });
  assert.ok(!local.bok, 'no boost left: none predicted');
  onMsg(S, { t: 'soc', a: 0, off: 1 });
  assert.ok(!local.frz && !local.bok && !S.soc.st, 'away from the arena: nothing held');
});
