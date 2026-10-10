// Real cells (task #362 part 3; shared/cells.js, server/systems/cells.js, custody.js): a cell block at the back of every
// police station - barred cells you can see into but not walk or shoot out of; booked from the police car at the kerb,
// two officers walk you in through the front door and down the corridor to a cell (the one with the fewest in it);
// in the cell you're a real person in the world: walk round, sit on the bench or the toilet, hold the bars; cellmates
// can't hurt each other; out by time or bail at the front door; logging out and back in puts you back in your cell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { STAR_HEAT, PED_RADIUS } from '../shared/constants.js';
import { JAIL_S, BAIL_PER_STAR, HOLD_S, GHOST_SECONDS, CELL_WALK_S, CELL_CAP, CELL_SHARE, CELL_REGULARS, INMATE_S } from '../shared/rules.js';
import { mulberry32 } from '../shared/rng.js';
import { K } from '../shared/constants.js';
import { cellBlockAt, inCellRect } from '../shared/cells.js';
import { pedStep } from '../shared/physics.js';
import * as players from '../server/systems/players.js';
import * as law from '../server/systems/law.js';
import * as custody from '../server/systems/custody.js';
import * as cells from '../server/systems/cells.js';
import * as combat from '../server/systems/combat.js';
import * as vehicles from '../server/systems/vehicles.js';
import { spawnNpc, walkInAt } from '../server/systems/npc.js';
import { _descriptor } from '../server/net.js';

function corner(w) { return w.map.nodes.find((q) => q.lvl === 0 && Math.hypot(q.x - 26000, q.y - 17000) < 2500); }
function wanted(w, p, stars) { law.addHeat(w, p, STAR_HEAT[stars] + 2 - p.heat, p.ped.x, p.ped.y); }
const cellOf = (w, p) => cells.blocks(w)[p.custody.cell.b].cells[p.custody.cell.c];
// a wanted player turns themself in: straight into a cell
function jailed(w, stars = 1, cash = 0) {
  const { p, prof, conn } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  prof.cash = cash; prof.bank = 0;
  wanted(w, p, stars);
  law.arrest(w, null, p.ped);
  assert.ok(custody.inCell(p), 'in a cell');
  return { p, prof, conn };
}
const push = (p, mx, my, bits = 0) => p.inputQ.push({ seq: p.ack + 1 + p.inputQ.length, bits, mx, my, aim: Math.atan2(my, mx) });
function until(w, cond, seconds) { for (let i = 0; i < seconds * 20; i++) { w.step(); if (cond()) return true; } return false; }
function walkFor(w, p, mx, my, seconds) { for (let i = 0; i < seconds * 20; i++) { push(p, mx, my); w.step(); } }

test('every police station has a cell block: two to four barred cells, a corridor; bars you can\'t walk or shoot through but can see through', () => {
  const w = makeWorld(), m = w.map;
  const stations = m.pois.filter((q) => q.kind === 'police');
  assert.ok(stations.length >= 5);
  for (const st of stations) {
    const b = cells.blockOf(w, st.id);
    assert.ok(b >= 0, `${st.label} has cells`);
    const k = m.cellBlocks[b];
    assert.ok(k.cells.length >= 2 && k.cells.length <= 4, `${st.label}: ${k.cells.length} cells`);
    assert.ok(walkInAt(m, k.gap.x, k.corridorY), 'inside the station');
    const tester = joinPlayer(w).p.ped;
    for (const c of k.cells) {
      const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      assert.ok(c.x1 - c.x0 >= 40 && c.y1 - c.y0 >= 30, 'room to walk round');
      assert.equal(cellBlockAt(m, cx, cy).c, k.cells.indexOf(c));
      // straight at the bars (and the door): you stop at them
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0.7, 0.7]]) {
        teleport(w, tester, c.door.x, cy);
        for (let i = 0; i < 80; i++) pedStep(tester, { bits: 0, mx: dx, my: dy, aim: 0 }, 0.05, m, players.pedMods(w, tester));
        assert.ok(inCellRect(c, tester.x, tester.y, PED_RADIUS), `${st.label}: still in the cell after walking (${dx},${dy}) - at ${Math.round(tester.x)},${Math.round(tester.y)}`);
      }
      // a shot from the corridor stops on the bars; you see through them
      assert.ok(m.rayTiles(c.door.x + 6, k.corridorY, cx + 6, cy) < 1, 'bullets stop on the bars');
      assert.ok(m.los(c.door.x + 6, k.corridorY, cx + 6, cy), 'you see through them');
    }
    // the front desk still works: in front of its counter, in the lobby
    assert.ok(Math.abs(st.y - k.gap.lobbyY) < 40, 'the desk faces the lobby');
  }
});

test('booked from the police car at the kerb: two officers walk you in through the door and down the corridor to a cell', () => {
  const w = makeWorld();
  const officer = joinPlayer(w, { samaritan: 100 }).p, { p, prof } = joinPlayer(w);
  assert.equal(law.goOnDuty(w, officer), null);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  prof.cash = 300;
  wanted(w, p, 2);
  teleport(w, officer.ped, p.ped.x + 24, p.ped.y);
  p.ped.downUntil = w.time + 3;
  law.arrest(w, officer.ped, p.ped);
  run(w, HOLD_S + 1);
  const v = w.spawnVehicle('police', p.ped.x + 60, p.ped.y + 70, 0, { npcOwned: false });
  custody.interaction(w, officer).run();
  teleport(w, officer.ped, v.x, v.y - 40);
  vehicles.tryEnter(w, officer.ped);
  const job = custody.deliveryFor(w, officer);
  v.x = job.x; v.y = job.y; v.vx = 0; v.vy = 0; w.place(v);
  w.step();
  assert.equal(p.custody.stage, 'walkin', 'out of the back of the car');
  assert.ok(p.ped.cuffed && !p.ped.vehId && !p.ped.hidden, 'cuffed, on foot, in plain sight');
  assert.equal(p.wanted, 0, 'booked');
  const lead = w.get(p.custody.lead), rear = w.get(p.custody.rear);
  assert.ok(lead && rear && lead.npc.role === 'cop' && rear.npc.role === 'cop', 'two officers');
  const target = p.custody.cell;
  let inStation = false, inCorridor = false;
  for (let i = 0; i < (CELL_WALK_S + 5) * 20 && p.custody.stage === 'walkin'; i++) {
    w.step();
    if (p.custody.stage !== 'walkin') break;
    if (walkInAt(w.map, p.ped.x, p.ped.y)) inStation = true;
    const at = cellBlockAt(w.map, p.ped.x, p.ped.y);
    if (at && at.c < 0) inCorridor = true;
    assert.ok(Math.hypot(lead.x - p.ped.x, lead.y - p.ped.y) < 120 && Math.hypot(rear.x - p.ped.x, rear.y - p.ped.y) < 120, 'the officers with them');
  }
  assert.equal(p.custody.stage, 'cell', 'in a cell');
  assert.ok(inStation && inCorridor, 'walked in through the station and down the corridor');
  assert.deepEqual(p.custody.cell, target, 'the cell they were taken to');
  const c = cellOf(w, p);
  assert.ok(inCellRect(c, p.ped.x, p.ped.y, 2), 'inside the cell\'s bounds');
  assert.ok(!p.ped.hidden && !p.ped.cuffed && !p.ped.interior, 'not hidden, the cuffs off');
  assert.ok(Math.abs(w.time - p.custody.since) < 1 && p.custody.until - w.time > JAIL_S - 2, 'the time starts in the cell');
  run(w, 2);
  assert.ok(!cells.doorOpen(w, target.b, target.c), 'the door locked behind them');
  assert.ok(inCellRect(c, p.ped.x, p.ped.y, 2));
});

test('in the cell: walk round it but not out; sit on the bench, the toilet, hold the bars', () => {
  const w = makeWorld();
  const { p } = jailed(w);
  const c = cellOf(w, p), ped = p.ped;
  // walk round it - and the bars hold, every way
  const x0 = ped.x;
  walkFor(w, p, 1, 0, 0.5);
  assert.ok(Math.abs(ped.x - x0) > 4 || ped.x >= c.x1 - 2, 'walking about');
  for (const [mx, my] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1]]) {
    walkFor(w, p, mx, my, 3);
    assert.ok(inCellRect(c, ped.x, ped.y, 2), `still inside after walking (${mx},${my})`);
  }
  // the bench
  teleport(w, ped, c.bench.x, c.bench.y + 8);
  let act = players.findInteraction(w, p);
  assert.match(act.label, /bench/i);
  act.run();
  assert.ok(ped.sitBench && ped.seat2 === 'bench', 'sitting');
  assert.equal(_descriptor(ped).sb, 2, 'everyone sees them sitting (sb 2: a seat in a cell - all six ways of sitting a while, client/art2/game/peds.js sitFrame)');
  walkFor(w, p, 0, 0, 1);   // (standing still: no input moving)
  assert.ok(ped.sitBench, 'stays sat');
  walkFor(w, p, 0, 1, 0.3);
  assert.ok(!ped.sitBench, 'up again on moving');
  // the toilet
  teleport(w, ped, c.toilet.x - 4, c.toilet.y + 6);
  act = players.findInteraction(w, p);
  assert.match(act.label, /toilet/i);
  act.run();
  assert.ok(ped.sitBench && ped.seat2 === 'toilet' && Math.hypot(ped.x - c.toilet.x, ped.y - c.toilet.y) < 1, 'on the toilet');
  assert.match(players.findInteraction(w, p).label, /get up/i);
  players.findInteraction(w, p).run();
  assert.ok(!ped.sitBench);
  // the bars
  teleport(w, ped, (c.x0 + c.x1) / 2, c.front - 4);
  act = players.findInteraction(w, p);
  assert.match(act.label, /bars/i);
  act.run();
  assert.ok(ped.holdBars && Math.abs(ped.y - c.front) < 1 && Math.abs(ped.a - c.a) < 0.01, 'at the bars, facing out');
  assert.equal(_descriptor(ped).hb, 1, 'hands on the bars, for all to see');
  walkFor(w, p, 0, 0, 1);
  assert.ok(ped.holdBars && inCellRect(c, ped.x, ped.y, 2));
});

test('the fight button in a cell: at the bars they rattle, by a wall a fist on it, turned to face it - nobody hurt (task #379)', () => {
  const w = makeWorld();
  const { p } = jailed(w);
  const c = cellOf(w, p), ped = p.ped, IN_FIRE = 1;
  const heard = [];
  const emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { if (ev.e === 'bang') heard.push(ev); return emit(x, y, ev); };
  const fire = () => { push(p, 0, 0, IN_FIRE); w.step(); push(p, 0, 0, 0); w.step(); };
  // holding the bars: they rattle (k 1), facing out
  teleport(w, ped, (c.x0 + c.x1) / 2, c.front - 4);
  players.findInteraction(w, p).run();
  fire();
  assert.equal(heard.length, 1, 'one bang a press');
  assert.equal(heard[0].k, 1, 'the bars rattled');
  assert.ok(ped.holdBars, 'still holding them');
  // held down, no more than one a press; and a moment between presses
  for (let i = 0; i < 10; i++) { push(p, 0, 0, IN_FIRE); w.step(); }
  assert.equal(heard.length, 1, 'holding the button bangs once');
  push(p, 0, 0, 0); w.step();
  // by the side wall: a fist on it, turned to face it (k 2)
  players.findInteraction(w, p).run();   // (let go of the bars)
  const back = Math.abs(c.front - c.y0) < Math.abs(c.front - c.y1) ? c.y1 : c.y0, my = (c.front + back) / 2;
  teleport(w, ped, c.x0 + 6, my);
  run(w, 0.5);
  fire();
  const last = heard[heard.length - 1];
  assert.equal(last.k, 2, 'a fist on the wall');
  assert.ok(Math.abs(Math.cos(ped.a) + 1) < 0.01, 'facing the wall (west)');
  // in the middle of the floor, nothing to hit; sitting, neither
  const n = heard.length;
  teleport(w, ped, (c.x0 + c.x1) / 2, my);
  run(w, 0.5);
  if (Math.min(Math.abs(ped.y - back), ped.x - c.x0, c.x1 - ped.x, Math.abs(ped.y - c.front)) > 26) { fire(); assert.equal(heard.length, n, 'nothing within reach: nothing happens'); }
  teleport(w, ped, c.bench.x, c.bench.y + 8);
  players.findInteraction(w, p).run();
  run(w, 0.5);
  fire();
  assert.equal(heard.length, n, 'sitting: no banging');
  assert.ok(ped.hp > 0 && !ped.dead, 'and nobody hurt');
});

test('cellmates share a cell and can\'t hurt each other; weapons are put away in the cell block', () => {
  const w = makeWorld();
  const first = jailed(w).p;
  const k = cells.blocks(w)[first.custody.cell.b];
  const list = [first];
  for (let i = 0; i < k.cells.length; i++) list.push(jailed(w).p);
  // players spread over the cells (one in each before any has two - an NPC doing time may be in with them: task #380),
  // then they share
  const per = new Map();
  for (const q of list) { assert.equal(q.custody.cell.b, first.custody.cell.b, 'the same station'); per.set(q.custody.cell.c, (per.get(q.custody.cell.c) || 0) + 1); }
  assert.equal(per.size, k.cells.length, 'spread over the cells');
  const [a, b] = list.filter((q) => list.some((o) => o !== q && o.custody.cell.c === q.custody.cell.c));
  assert.ok(a && b, 'two prisoners share a cell');
  assert.ok(Math.max(...per.values()) <= CELL_CAP);
  run(w, 0.2);
  assert.ok(a.ped.cellSafe && b.ped.cellSafe);
  // fists: nothing
  teleport(w, b.ped, a.ped.x + 16, a.ped.y);
  const hp = b.ped.hp;
  for (let i = 0; i < 6; i++) { a.ped.nextAttack = 0; combat.tryAttack(w, a.ped, 0); run(w, 0.2); }
  assert.equal(b.ped.hp, hp, 'no damage');
  assert.ok(w.time >= b.ped.downUntil && w.time >= (b.ped.stunUntil || 0), 'not knocked down');
  // a gun: put away there; any damage at all comes to nothing
  a.profile.weapons.pistol = 30; a.ped.mag.pistol = 12; a.ped.weapon = 'pistol';
  run(w, 0.2);
  assert.equal(a.ped.weapon, 'fists', 'weapons put away');
  assert.equal(combat.damage(w, b.ped, 50, a.ped, 'gun'), false);
  assert.equal(b.ped.hp, hp);
  // from outside the bars, nothing either
  const visitor = joinPlayer(w).p;
  teleport(w, visitor.ped, k.gap.x, k.corridorY);
  visitor.profile.weapons.pistol = 30; visitor.ped.mag.pistol = 12; visitor.ped.weapon = 'pistol';
  run(w, 0.2);
  assert.equal(visitor.ped.weapon, 'fists', 'away in the corridor too');
  teleport(w, visitor.ped, k.gap.x, k.gap.lobbyY + 30);
  run(w, 0.3);
  assert.equal(visitor.ped.weapon, 'pistol', 'back in hand out in the lobby');
});

// ---- several to a cell, each on a spot of their own (task #380) --------------------------------------------------------
// everyone standing, sitting or holding the bars in cell c of block b
const inCell = (w, b, c) => w.query((cells.blocks(w)[b].x0 + cells.blocks(w)[b].x1) / 2, (cells.blocks(w)[b].y0 + cells.blocks(w)[b].y1) / 2, 600, K.PED)
  .filter((e) => !e.dead && !e.removed && !e.vehId && inCellRect(cells.blocks(w)[b].cells[c], e.x, e.y, 3));
function apart(people) {
  let min = Infinity;
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) min = Math.min(min, Math.hypot(people[i].x - people[j].x, people[i].y - people[j].y));
  return min;
}

test('several to a cell, each on a spot of their own - the bench, the bars, standing about - nobody on top of anyone (task #380)', () => {
  const w = makeWorld({ rand: mulberry32(380) });
  const { p: visitor } = joinPlayer(w);
  const st = custody.nearestStation(w, corner(w).x, corner(w).y), b = cells.blockOf(w, st.id), k = cells.blocks(w)[b];
  // two NPCs doing time in every cell, one sitting and one at the bars
  w.inmates = [];
  for (let c = 0; c < k.cells.length; c++) for (const pose of [0, 1]) w.inmates.push({ b, c, app: null, ar: 'drunk', until: w.time + INMATE_S, ped: 0, pose });
  teleport(w, visitor.ped, k.gap.x, k.gap.lobbyY);
  run(w, 1.5);
  assert.equal([...w.entities.values()].filter((e) => e.npc && e.npc.inmate).length, 2 * k.cells.length, 'made flesh while someone is near');
  // four prisoners put in, and one more walked in from the kerb
  const pris = [];
  for (let i = 0; i < 4; i++) pris.push(jailed(w).p);
  const officer = joinPlayer(w, { samaritan: 100 }).p, { p: walked } = joinPlayer(w);
  assert.equal(law.goOnDuty(w, officer), null);
  teleport(w, walked.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, walked, 1);
  teleport(w, officer.ped, walked.ped.x + 24, walked.ped.y);
  walked.ped.downUntil = w.time + 3;
  law.arrest(w, officer.ped, walked.ped);
  run(w, HOLD_S + 1);
  const v = w.spawnVehicle('police', walked.ped.x + 60, walked.ped.y + 70, 0, { npcOwned: false });
  custody.interaction(w, officer).run();
  teleport(w, officer.ped, v.x, v.y - 40);
  vehicles.tryEnter(w, officer.ped);
  const job = custody.deliveryFor(w, officer);
  v.x = job.x; v.y = job.y; v.vx = 0; v.vy = 0; w.place(v);
  w.step();
  assert.equal(walked.custody.stage, 'walkin');
  assert.ok(until(w, () => walked.custody.stage === 'cell', CELL_WALK_S + 5), 'walked in to a cell');
  run(w, 1);
  pris.push(walked);
  // everyone in their cell, sharing - and nobody closer to anybody than a body's width
  let most = 0;
  for (let c = 0; c < k.cells.length; c++) {
    const here = inCell(w, b, c);
    most = Math.max(most, here.length);
    assert.ok(here.length <= CELL_CAP + 2, `cell ${c}: ${here.length}`);
    assert.ok(here.length < 2 || apart(here) >= 13.9, `cell ${c}: ${here.length} people, two of them ${apart(here).toFixed(1)} px apart`);
  }
  assert.ok(most >= 3, `several to a cell (${most})`);
  for (const q of pris) assert.ok(q.custody.stage === 'cell' && inCell(w, b, q.custody.cell.c).includes(q.ped), 'each in their own cell, in plain sight');
  // the NPCs on the bench sit at its places, the ones at the bars stand at them
  for (const e of [...w.entities.values()].filter((q) => q.npc && q.npc.inmate)) {
    const cl = k.cells[cellBlockAt(w.map, e.x, e.y).c], S = cells.spots(cl);
    assert.ok([...S.bench, ...S.bars, ...S.floor].some((s) => Math.hypot(s.x - e.x, s.y - e.y) < 1), 'an inmate on a spot');
    if (e.sitBench) assert.ok(S.bench.some((s) => Math.hypot(s.x - e.x, s.y - e.y) < 1), 'sitting on the bench');
    if (e.holdBars) assert.ok(Math.abs(e.y - cl.front) < 1, 'at the bars');
  }
});

test('beside a cellmate: the next place on the bench, the next free place at the bars, and walking into them you\'re held off (task #380)', () => {
  const w = makeWorld({ rand: mulberry32(381) });
  const { p } = jailed(w);
  const c = cellOf(w, p), ped = p.ped, S = cells.spots(c);
  for (const e of [...w.entities.values()].filter((q) => q.npc && q.npc.inmate)) w.remove(e);   // (the regulars: elsewhere for this)
  w.inmates = [];
  const mate = (s) => { const e = spawnNpc(w, 'drunk', s.x, s.y, 'civ'); e.npc.desk = { x: s.x, y: s.y, a: c.a }; e.npc.inmate = true; return e; };
  // someone sitting in the middle of the bench: you sit beside them
  const sitter = mate(S.bench[0]); sitter.sitBench = true;
  teleport(w, ped, S.bench[0].x + 2, S.bench[0].y + 8);
  players.findInteraction(w, p).run();
  assert.ok(ped.sitBench && Math.abs(Math.abs(ped.x - sitter.x) - 20) < 1 && Math.abs(ped.y - sitter.y) < 1, `beside them on the bench (${(ped.x - sitter.x).toFixed(1)} px)`);
  players.findInteraction(w, p).run();
  // someone at the bars right where you are: you take hold of them a little along
  const holder = mate(S.bars[0]); holder.holdBars = true;
  teleport(w, ped, S.bars[0].x, c.front - 4);
  const act = players.findInteraction(w, p);
  assert.match(act.label, /bars/i);
  act.run();
  assert.ok(ped.holdBars && Math.abs(ped.y - c.front) < 1 && Math.abs(ped.x - holder.x) >= 18, `at the bars beside them (${(ped.x - holder.x).toFixed(1)} px)`);
  walkFor(w, p, 0, -1, 0.2);
  // walking straight into someone standing there: held off them
  const stander = mate(S.floor[0]);
  teleport(w, ped, S.floor[0].x - 40, S.floor[0].y);
  let closest = Infinity;
  for (let i = 0; i < 40; i++) { push(p, 1, 0); w.step(); closest = Math.min(closest, Math.hypot(ped.x - stander.x, ped.y - stander.y)); }
  assert.ok(closest >= 13.9, `never walked into them (${closest.toFixed(1)} px)`);
  assert.ok(inCellRect(c, ped.x, ped.y, 2), 'still in the cell');
});

test('booked into a block, a couple of others are doing time there - and you are often put in with one of them (task #380)', () => {
  const w = makeWorld({ rand: mulberry32(382) });
  let shared = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    w.inmates = [];
    for (const e of [...w.entities.values()].filter((q) => q.npc && q.npc.inmate)) w.remove(e);
    const { p } = jailed(w, 1, 1000);
    const { b, c } = p.custody.cell;
    assert.ok(w.inmates.filter((m) => m.b === b).length >= CELL_REGULARS, 'a couple doing time there');
    n++;
    if (w.inmates.some((m) => m.b === b && m.c === c)) shared++;
    assert.equal(custody.payBail(w, p), null);
  }
  assert.ok(Math.abs(shared / n - CELL_SHARE) < 0.17, `put in with someone ${shared} times in ${n} (about ${CELL_SHARE * 100}%)`);
});

test('out by time or bail: at the station\'s front door, outside, free; NPC crooks do time there too', () => {
  const w = makeWorld();
  const { p, prof } = jailed(w, 2, 5000);
  const k = cells.blocks(w)[p.custody.cell.b], cash = prof.cash;
  assert.equal(custody.payBail(w, p), null);
  assert.equal(prof.cash, cash - BAIL_PER_STAR * 2, 'paid');
  assert.ok(!p.custody && !p.ped.hidden, 'free');
  assert.ok(!walkInAt(w.map, p.ped.x, p.ped.y) && Math.hypot(p.ped.x - k.door.x, p.ped.y - k.door.outY) < 30, 'outside the front door');
  const q = jailed(w).p;
  run(w, JAIL_S + 1);
  assert.ok(!q.custody && !walkInAt(w.map, q.ped.x, q.ped.y), 'time served: out the front');
  // an NPC crook the police arrest is locked up in the nearest station's cells (made flesh while someone's near)
  const crook = spawnNpc(w, 'thug', k.door.x + 200, k.door.outY + 200, 'civ');
  law.arrest(w, null, crook);
  assert.ok((w.inmates || []).some((m2) => m2.b === cells.blocks(w).indexOf(k)), 'on the books');
  teleport(w, q.ped, k.gap.x, k.gap.lobbyY);
  run(w, 2);
  const inm = [...w.entities.values()].find((e) => e.npc && e.npc.inmate);
  assert.ok(inm && cellBlockAt(w.map, inm.x, inm.y)?.c >= 0, 'in a cell, for anyone to see');
});

test('logging out in a cell and back in: back in your cell with the time you had left', () => {
  const w = makeWorld();
  const { p, prof, conn } = jailed(w, 1, 0);
  run(w, 5);
  players.leave(w, p);
  run(w, GHOST_SECONDS + 1);
  assert.ok(prof.jail && prof.jail.left > 0, 'the sentence saved');
  const left = prof.jail.left;
  const back = players.join(w, conn, prof);
  assert.ok(custody.inCell(back), 'back in a cell');
  assert.ok(!back.ped.hidden && inCellRect(cellOf(w, back), back.ped.x, back.ped.y, 2), 'in the cell itself, in plain sight');
  assert.ok(Math.abs(back.custody.until - w.time - left) < 1, 'with the time it had left');
});
