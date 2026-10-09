// Arrests and police escalation (design notes 2026-10-08; server/systems/custody.js, police.js): cuffed, held on the
// ground, walked to a police car, driven to the station and booked into a cell (only then fined and stripped of
// contraband), bail or wait; the ways out (the officer down, a blast, a carjack, left alone); a player officer driving
// their prisoner in; killed by the police you wake at a hospital; how hard the police come at you by stars; in through
// a shop's door after you and out through it to the car.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { STAR_HEAT, K } from '../shared/constants.js';
import { JAIL_S, BAIL_PER_STAR, BUST_FINE_PER_STAR, HOLD_S, ARREST_REWARD_PER_STAR, DELIVER_BONUS, CUSTODY_STUCK_S, CUSTODY_SKIP_S, CUSTODY_WAIT_BREAK_S, GHOST_SECONDS, ESCORT_WALK_PX } from '../shared/rules.js';
import { PED_BLOCK } from '../shared/map.js';
import * as players from '../server/systems/players.js';
import * as law from '../server/systems/law.js';
import * as custody from '../server/systems/custody.js';
import * as combat from '../server/systems/combat.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as homes from '../server/systems/homes.js';
import { spawnNpc, footWay, walkInAt } from '../server/systems/npc.js';
import { _descriptor } from '../server/net.js';
import { cellBlockAt } from '../shared/cells.js';

// a street corner in town near the police HQ (a road node, so the police drive straight in)
function corner(w) { return w.map.nodes.find((q) => q.lvl === 0 && Math.hypot(q.x - 26000, q.y - 17000) < 2500); }
function wanted(w, p, stars) { law.addHeat(w, p, STAR_HEAT[stars] + 2 - p.heat, p.ped.x, p.ped.y); }
function until(w, cond, seconds) { for (let i = 0; i < seconds * 20; i++) { w.step(); if (cond()) return true; } return false; }
// every message a player is shown (they're flushed to the connection each tick)
function listen(w) {
  const log = new Map(), notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { if (q) { if (!log.has(q)) log.set(q, []); log.get(q).push(text); } return notify(q, text, tone); };
  return (q, re) => (log.get(q) || []).some((t) => re.test(t));
}

test('arrested by the police: held down, walked to the car, driven to the station, booked - fined only in the cell; bail', () => {
  const w = makeWorld(), told = listen(w);
  const { p, prof } = joinPlayer(w);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  prof.cash = 900; prof.bank = 1000;
  prof.weapons.smg = 60; p.ped.mag.smg = 30;
  prof.inventory.ghostglass = 2;
  wanted(w, p, 1);
  assert.equal(p.wanted, 1);
  // they come, tackle them (a 1-star chase) and cuff them
  assert.ok(until(w, () => p.custody, 60), 'arrested within a minute');
  assert.ok(told(p, /Tackled|Dragged out|Cuffed/), 'tackled and cuffed');
  assert.equal(p.custody.stage, 'held');
  assert.ok(p.ped.cuffed && w.time < p.ped.downUntil, 'cuffed, held face down');
  assert.equal(_descriptor(p.ped).cf, 1, 'everyone sees the cuffs');
  assert.equal(prof.cash, 900, 'nothing taken yet');
  assert.ok(prof.weapons.smg !== undefined && prof.inventory.ghostglass === 2);
  assert.ok(p.wanted >= 1, 'still wanted');
  const at = { x: p.ped.x, y: p.ped.y };
  run(w, 2);
  assert.ok(Math.hypot(p.ped.x - at.x, p.ped.y - at.y) < 40, 'pinned');
  // a car takes them in
  assert.ok(until(w, () => p.custody && p.custody.stage === 'ride', 70), 'walked to a police car and put in the back');
  const car = w.get(p.ped.vehId);
  assert.ok(car && car.def.police && p.ped.seat > 0, 'in the back of a police car');
  // the station: booked
  assert.ok(until(w, () => p.custody && p.custody.stage === 'cell', 160), 'booked at the station');
  const st = w.map.pois[p.custody.station];
  assert.equal(st.kind, 'police');
  assert.ok(!p.ped.hidden && !p.ped.interior && !p.ped.cuffed && cellBlockAt(w.map, p.ped.x, p.ped.y)?.c >= 0, 'in a cell - in plain sight, walked in');
  const stars = Math.max(1, p.custody.stars);
  assert.equal(prof.cash, 900 - Math.min(900, BUST_FINE_PER_STAR * stars), 'fined in the cell');
  assert.equal(prof.weapons.smg, undefined, 'the illegal gun taken');
  assert.ok(!prof.inventory.ghostglass, 'the contraband taken');
  assert.equal(p.wanted, 0, 'the stars wiped');
  assert.equal(p.custody.bail, BAIL_PER_STAR * stars);
  // bail: out of the station's front door
  const bank = prof.bank;
  assert.equal(custody.payBail(w, p), null);
  assert.equal(prof.bank, bank - BAIL_PER_STAR * stars, 'from the bank');
  assert.ok(!p.custody && !p.ped.hidden, 'free');
  assert.ok(!walkInAt(w.map, p.ped.x, p.ped.y) && Math.hypot(p.ped.x - st.outside.x, p.ped.y - st.outside.y) < 120, 'outside the station\'s front door');
});

// A police unit whose officers got out and ran after the suspect on foot: the car left empty back along the road.
function footUnit(w, p, carX, carY, crewN = 2) {
  const v = w.spawnVehicle('police', carX, carY, Math.atan2(p.ped.y - carY, p.ped.x - carX), {});
  v.despawnable = false;
  const crew = [];
  for (let i = 0; i < crewN; i++) { const c = spawnNpc(w, 'cop', p.ped.x + 18 + i * 40, p.ped.y + (i ? 24 : 0), 'cop'); c.npc.unit = v.id; c.weapon = 'baton'; c.npc.tactic = 'tackle'; crew.push(c); }
  v.ai = { kind: 'police', target: p.pid, mode: 'foot', route: null, routeAt: 0, force: 'police', footAt: w.time };
  (w.police ??= new Set()).add(v.id);
  return { v, crew };
}

test('cuffed on the ground a way from the car the officers left (task #378): one of them runs back for it, it comes, and in you go', () => {
  const w = makeWorld(), told = listen(w);
  const road = straightRoad(w.map, 1400);
  const { p } = joinPlayer(w);
  teleport(w, p.ped, road.x + 300, road.y);
  wanted(w, p, 1);
  // the officers chased them on foot: the car empty back along the road, too far to walk them to (task #376)
  const { v, crew } = footUnit(w, p, road.x + 300 + ESCORT_WALK_PX + 250, road.y);
  p.ped.downUntil = w.time + 3;
  law.arrest(w, crew[0], p.ped);
  assert.ok(p.custody && p.custody.stage === 'held');
  let came = null;
  const done = until(w, () => {
    if (p.custody && p.custody.stage === 'escort' && came === null) came = Math.hypot(v.x - p.ped.x, v.y - p.ped.y);
    return p.custody && p.custody.stage === 'ride';
  }, HOLD_S + 30);
  assert.ok(done, `in the back of a car within half a minute (stage ${p.custody && p.custody.stage}, the car ${Math.round(Math.hypot(v.x - p.ped.x, v.y - p.ped.y))} px off)`);
  assert.equal(p.ped.vehId, v.id, 'the unit\'s own car');
  assert.ok(p.ped.seat > 0, 'in the back');
  assert.ok(came !== null && came < 300, `it was driven over to them (${Math.round(came)} px off when they were walked to it)`);
  const drv = w.get(v.seats[0]);
  assert.ok(drv && drv.npc && drv.npc.role === 'cop', 'an officer at the wheel');
  assert.ok(!told(p, /isn't coming/), 'no waiting for a car that never comes');
  // nobody to bring it (the officer holding them is the only one left): another car is sent, and takes them in
  const w2 = makeWorld();
  const { p: q } = joinPlayer(w2);
  teleport(w2, q.ped, road.x + 300, road.y);
  wanted(w2, q, 2);
  const lone = footUnit(w2, q, road.x + 1000, road.y, 1);
  q.ped.downUntil = w2.time + 3;
  law.arrest(w2, lone.crew[0], q.ped);
  run(w2, HOLD_S + 0.2);
  assert.equal(q.custody.stage, 'fetch');
  assert.ok(q.custody.car && q.custody.car !== lone.v.id, 'not the empty car: another one sent');
  assert.ok(until(w2, () => q.custody && q.custody.stage === 'ride', 50), 'in the back of the car sent');
  assert.ok(w2.get(q.ped.vehId).def.police && q.ped.seat > 0);
});

test('the officer who cuffed you walks you to their own car close by, you cuffed at their side, and puts you in the back (task #376)', () => {
  const w = makeWorld(), told = listen(w);
  const road = straightRoad(w.map, 1400);
  const { p } = joinPlayer(w);
  teleport(w, p.ped, road.x + 300, road.y);
  wanted(w, p, 1);
  // their car 420 px back along the road, empty (both officers chased on foot)
  const { v, crew } = footUnit(w, p, road.x + 720, road.y);
  const parked = { x: v.x, y: v.y };
  p.ped.downUntil = w.time + 3;
  law.arrest(w, crew[0], p.ped);
  run(w, HOLD_S + 0.1);
  assert.equal(p.custody.stage, 'escort', 'straight to the walk: no waiting for a car');
  assert.equal(p.custody.car, v.id, 'to their own car');
  assert.equal(p.custody.holder, crew[0].id, 'the officer who cuffed them walks them');
  assert.ok(told(p, /walks you to their car/), 'told');
  let beside = 0, n = 0, far = 0;
  const done = until(w, () => {
    if (p.custody.stage === 'escort' && p.custody.picked) {
      const e = crew[0], d = Math.hypot(e.x - p.ped.x, e.y - p.ped.y);
      assert.ok(p.ped.cuffed && w.time >= p.ped.downUntil, 'up on their feet, cuffed');
      assert.ok(_descriptor(e).es, 'everyone sees the officer\'s hand on their arm');
      if (Math.hypot(e.vx, e.vy) > 30) {
        n++;
        const ux = Math.cos(e.a), uy = Math.sin(e.a), dx = p.ped.x - e.x, dy = p.ped.y - e.y;
        if (Math.abs(dx * -uy + dy * ux) > 8 && Math.abs(dx * ux + dy * uy) < 12) beside++;
      }
      far = Math.max(far, d);
    }
    return p.custody.stage === 'ride';
  }, 20);
  assert.ok(done, `in the back of the car within 20 s of the walk (stage ${p.custody.stage})`);
  assert.equal(p.ped.vehId, v.id);
  assert.ok(p.ped.seat > 0, 'in the back');
  assert.ok(n > 20 && beside / n > 0.7, `walked at the officer's side (${beside} of ${n} steps)`);
  assert.ok(far < 40, `never more than a step from the officer (${Math.round(far)} px)`);
  assert.ok(Math.hypot(parked.x - v.x, parked.y - v.y) < 30, 'the car waited where it was parked');
  assert.equal(_descriptor(crew[0]).es, undefined, 'and let go once they\'re in');
  // their car too far to walk to: it's brought over (task #378's test drives it)
  const w2 = makeWorld();
  const { p: q } = joinPlayer(w2);
  teleport(w2, q.ped, road.x + 300, road.y);
  wanted(w2, q, 1);
  const far2 = footUnit(w2, q, road.x + 300 + ESCORT_WALK_PX + 300, road.y);
  q.ped.downUntil = w2.time + 3;
  law.arrest(w2, far2.crew[0], q.ped);
  run(w2, HOLD_S + 0.1);
  assert.equal(q.custody.stage, 'fetch', 'too far to walk: the car comes');
  assert.equal(q.custody.car, far2.v.id, 'their own car, brought over');
  // a building between them and the car: no walking through it - the car comes
  const w3 = makeWorld();
  const { p: r } = joinPlayer(w3);
  const pair = blockedPair(w3);
  assert.ok(pair, 'a spot with a building between it and a road close by');
  teleport(w3, r.ped, pair.a.x, pair.a.y);
  wanted(w3, r, 1);
  const behind = footUnit(w3, r, pair.b.x, pair.b.y);
  r.ped.downUntil = w3.time + 3;
  law.arrest(w3, behind.crew[0], r.ped);
  run(w3, HOLD_S + 0.1);
  assert.equal(r.custody.stage, 'fetch', 'no clear way on foot: the car comes round');
});
// a street corner, and a spot in walking range of it with a building (or water) in between
function blockedPair(w) {
  const m = w.map, nodes = m.nodes.filter((q) => q.lvl === 0 && Math.hypot(q.x - 26000, q.y - 17000) < 3000);
  for (const n of nodes) {
    const a = { x: n.x + 32, y: n.y + 32 };
    if (PED_BLOCK[m.tileAtPx(a.x, a.y)] || walkInAt(m, a.x, a.y)) continue;
    for (let k = 0; k < 16; k++) for (let d = 300; d <= ESCORT_WALK_PX - 150; d += 50) {
      const b = { x: a.x + Math.cos(k * Math.PI / 8) * d, y: a.y + Math.sin(k * Math.PI / 8) * d };
      if (PED_BLOCK[m.tileAtPx(b.x, b.y)] || walkInAt(m, b.x, b.y)) continue;
      let blocked = 0;
      for (let i = 1; i < 40; i++) if (PED_BLOCK[m.tileAtPx(a.x + (b.x - a.x) * i / 40, a.y + (b.y - a.y) * i / 40)]) blocked++;
      if (blocked >= 4) return { a, b };
    }
  }
  return null;
}

test('the cell: wait it out, no bail money, no walking out; surrendering goes straight there', async () => {
  const unstuck = await import('../server/systems/unstuck.js');
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  prof.cash = 0; prof.bank = 0;
  wanted(w, p, 3);
  assert.equal(unstuck.surrender(w, p), null);
  assert.ok(p.custody && p.custody.stage === 'cell' && p.wanted === 0, 'turned yourself in: a cell');
  assert.match(custody.payBail(w, p), /don't have it/, 'no money, no bail');
  const at = cellBlockAt(w.map, p.ped.x, p.ped.y);
  assert.ok(at && at.c >= 0 && !p.ped.hidden, 'in a cell, in plain sight');
  for (let i = 0; i < 60; i++) { p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 1, aim: 0 }); w.step(); }
  assert.equal(cellBlockAt(w.map, p.ped.x, p.ped.y)?.c, at.c, 'nobody walks out of a cell');
  run(w, JAIL_S);
  assert.ok(!p.custody && !p.ped.hidden, 'out when the time is up');
});

test('ways out: the officer holding you killed; the police car blown open; carjacked; left alone', () => {
  const w = makeWorld(), told = listen(w);
  const n = corner(w);
  // the officer holding you down is killed (by a friend, say)
  {
    const { p } = joinPlayer(w);
    teleport(w, p.ped, n.x + 32, n.y + 32);
    wanted(w, p, 1);
    const cop = spawnNpc(w, 'cop', p.ped.x + 20, p.ped.y, 'cop');
    p.ped.downUntil = w.time + 3;
    law.arrest(w, cop, p.ped);
    assert.ok(p.custody && p.ped.cuffed);
    const heat = p.heat;
    run(w, 1);
    combat.damage(w, cop, 9999, null, 'melee');
    w.step();
    assert.ok(!p.custody && !p.ped.cuffed, 'free');
    assert.ok(p.heat > heat, 'and wanted more for escaping');
    assert.ok(told(p, /free/));
  }
  // a player officer's car: a blast bursts the doors open; someone else taking the car frees you; so does being left
  const officer = joinPlayer(w, { samaritan: 100 }).p;
  assert.equal(law.goOnDuty(w, officer), null);
  const load = (q) => {
    for (const e of w.query(n.x, n.y, 900, K.VEH)) if (!e.seats.some((id) => id && w.get(id) && w.get(id).player)) w.remove(e);   // (the last scene's car gone)
    teleport(w, q.ped, n.x + 32, n.y + 32);
    q.ped.vehId = 0; q.ped.hidden = false;
    wanted(w, q, 2);
    teleport(w, officer.ped, q.ped.x + 24, q.ped.y);
    q.ped.downUntil = w.time + 3;
    law.arrest(w, officer.ped, q.ped);
    const v = w.spawnVehicle('police', q.ped.x + 60, q.ped.y + 70, 0, { npcOwned: false });
    const act = custody.interaction(w, officer);
    assert.ok(act && /Put .* in the back/.test(act.label), `the prompt (${act && act.label})`);
    act.run();
    assert.equal(q.custody.stage, 'ride');
    assert.equal(q.ped.vehId, v.id);
    w.step();
    return v;
  };
  {
    const { p } = joinPlayer(w);
    const v = load(p);
    combat.blast(w, v.x + 70, v.y, 110, 30, null);
    w.step();
    assert.ok(!p.custody && !p.ped.vehId, 'blown out of the car and free');
  }
  {
    const { p } = joinPlayer(w);
    const v = load(p);
    const thief = joinPlayer(w).p;
    teleport(w, thief.ped, v.x, v.y - 40);
    vehicles.tryEnter(w, thief.ped);
    assert.equal(thief.ped.vehId, v.id);
    w.step();
    assert.ok(!p.custody && !p.ped.cuffed, 'the cuffs come off');
    assert.equal(p.ped.vehId, v.id, 'still in the back - and can get out');
  }
  {
    const { p } = joinPlayer(w);
    load(p);
    teleport(w, officer.ped, officer.ped.x + 900, officer.ped.y);
    w.step();
    assert.ok(!p.custody && !p.ped.vehId, 'left alone: slipped out');
  }
});

test('a player officer drives their prisoner in: any station, booked, paid extra', () => {
  const w = makeWorld();
  const officer = joinPlayer(w, { samaritan: 100 }).p, { p, prof } = joinPlayer(w);
  assert.equal(law.goOnDuty(w, officer), null);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  prof.cash = 600;
  wanted(w, p, 2);
  teleport(w, officer.ped, p.ped.x + 24, p.ped.y);
  p.ped.downUntil = w.time + 3;
  const cash0 = officer.profile.cash;
  law.arrest(w, officer.ped, p.ped);
  assert.equal(officer.profile.cash, cash0 + ARREST_REWARD_PER_STAR * 2, 'paid on the cuffs');
  run(w, HOLD_S + 1);
  assert.ok(p.custody && p.custody.stage !== 'ride', 'held, a car on its way');
  const v = w.spawnVehicle('police', p.ped.x + 60, p.ped.y + 70, 0, { npcOwned: false });
  custody.interaction(w, officer).run();
  teleport(w, officer.ped, v.x, v.y - 40);
  vehicles.tryEnter(w, officer.ped);
  assert.equal(officer.ped.vehId, v.id);
  const job = custody.deliveryFor(w, officer);
  assert.ok(job && /Take .* to /.test(job.text), 'a waypoint to the station');
  // drive there (the car put by the kerb)
  v.x = job.x; v.y = job.y; v.vx = 0; v.vy = 0; w.place(v);
  w.step();
  assert.ok(p.custody && p.custody.stage === 'walkin' && p.wanted === 0, 'booked - and walked in from the car (cells.test.js)');
  assert.equal(officer.profile.cash, cash0 + ARREST_REWARD_PER_STAR * 2 + Math.round(ARREST_REWARD_PER_STAR * 2 * DELIVER_BONUS), 'and paid extra for bringing them in');
  assert.ok(prof.cash < 600, 'fined');
});

test('logging out in custody books you into a cell - and you are still in it when you come back', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  prof.cash = 500;
  wanted(w, p, 2);
  const cop = spawnNpc(w, 'cop', p.ped.x + 20, p.ped.y, 'cop');
  p.ped.downUntil = w.time + 3;
  law.arrest(w, cop, p.ped);
  assert.ok(p.custody);
  players.leave(w, p);
  assert.ok(p.custody && p.custody.stage === 'cell' && p.wanted === 0 && prof.cash < 500, 'booked (fined, the stars gone) and kept in the cell');
  // back within the ghost window: still in the cell
  const again = players.join(w, conn, prof);
  assert.ok(again === p && custody.inCell(p), 'reconnected: still in the cell');
  // gone for good (past the ghost window): the time left goes with the character...
  run(w, 5);
  players.leave(w, p);
  run(w, GHOST_SECONDS + 1);
  assert.ok(!w.players.has(p.pid) && prof.jail && prof.jail.left > 0 && prof.jail.left <= JAIL_S, `saved: ${prof.jail && prof.jail.left}s left`);
  const left = prof.jail.left;
  run(w, 20);   // (time offline doesn't count)
  // ...and the next login starts in the cell with that time
  const back = players.join(w, conn, prof);
  assert.ok(custody.inCell(back) && !back.ped.hidden && cellBlockAt(w.map, back.ped.x, back.ped.y)?.c >= 0, 'back in the cell');
  assert.ok(Math.abs(back.custody.until - w.time - left) < 1, 'with the time it had left');
  assert.ok(!prof.jail, 'the saved sentence is used up');
});

test('the car stuck or going round in circles: make a break for it, or they get you there in the end', () => {
  const w = makeWorld(), told = listen(w);
  const { p } = joinPlayer(w);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  wanted(w, p, 1);
  const cop = spawnNpc(w, 'cop', p.ped.x + 20, p.ped.y, 'cop');
  p.ped.downUntil = w.time + 3;
  law.arrest(w, cop, p.ped);
  assert.equal(p.custody.stage, 'held');
  // a car that never comes (nothing to send): no break while it's on the way, then the offer
  run(w, HOLD_S + 0.5);
  assert.equal(p.custody.stage, 'fetch');
  const v = w.get(p.custody.car);
  if (v) { v.ai.prisoner = null; v.ai = null; w.police.delete(v.id); v.x += 3000; }   // (gone off somewhere, stuck)
  assert.ok(!custody.canBreak(p), 'not straight away');
  assert.ok(until(w, () => custody.canBreak(p), CUSTODY_WAIT_BREAK_S + 2), 'offered after a while');
  assert.ok(told(p, /make a break for it/i));
  const act = players.findInteraction(w, p);
  assert.ok(act && /break for it/i.test(act.label), 'on the action button');
  act.run();
  assert.ok(!p.custody && !p.ped.cuffed && p.wanted >= 1, 'away - and wanted for it');
  // in the back of a car that's going nowhere: the offer, then booked anyway
  const w2 = makeWorld();
  const { p: q } = joinPlayer(w2);
  teleport(w2, q.ped, n.x + 32, n.y + 32);
  wanted(w2, q, 1);
  const cop2 = spawnNpc(w2, 'cop', q.ped.x + 20, q.ped.y, 'cop');
  q.ped.downUntil = w2.time + 3;
  law.arrest(w2, cop2, q.ped);
  assert.ok(until(w2, () => q.custody && q.custody.stage === 'ride', 80), 'in the back of a car');
  const car = w2.get(q.ped.vehId);
  // the car's wheels lose all grip (a stand-in for stuck): it gets no nearer
  const freeze = () => { car.vx = 0; car.vy = 0; car.x = car.fx ?? (car.fx = car.x); car.y = car.fy ?? (car.fy = car.y); };
  for (let i = 0; i < (CUSTODY_STUCK_S + 1) * 20; i++) { w2.step(); freeze(); }
  assert.ok(custody.canBreak(q), 'offered');
  for (let i = 0; i < (CUSTODY_SKIP_S - CUSTODY_STUCK_S + 1) * 20 && q.custody.stage !== 'cell'; i++) { w2.step(); if (q.custody.stage === 'ride') freeze(); }
  assert.equal(q.custody.stage, 'cell', 'got there in the end');
});

test('killed by the police you wake up in a hospital, never at home', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, p, 4);
  const cop = spawnNpc(w, 'swat', p.ped.x + 40, p.ped.y, 'cop');
  combat.damage(w, p.ped, 99999, cop, 'gun');
  assert.ok(p.ped.dead);
  assert.ok(p.policeKill, 'killed by the police');
  assert.ok(homes.spawnOptions(w, p).every((o) => o.kind === 'hospital'), 'only hospitals to choose from');
  assert.match(p.respawnChoice, /^h:/);
  assert.match(p.deathCause, /SWAT|police/, `the cause names them (${p.deathCause})`);
  const h = w.map.hospitals[+p.respawnChoice.slice(2)];
  const nearest = [...w.map.hospitals].sort((a, b) => Math.hypot(a.x - p.ped.x, a.y - p.ped.y) - Math.hypot(b.x - p.ped.x, b.y - p.ped.y))[0];
  assert.equal(h, nearest, 'the nearest hospital');
  assert.ok(homes.resolveSpawn(w, p, 'home:0', { x: p.ped.x, y: p.ped.y }).name === nearest.name, 'a home picked anyway is ignored');
});

test('escalation: tackles at 1-2 stars, tasers at 3 (some pistols), guns at 4, the FBI, SWAT and the army at 5', () => {
  const look = (stars, seconds) => {
    const w = makeWorld();
    const { p } = joinPlayer(w);
    p.invincible = true;
    teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
    const forces = new Map(), crews = [];
    let armyAtOnce = 0;
    for (let i = 0; i < seconds * 20; i++) {
      p.heat = STAR_HEAT[stars] + 5; p.wanted = stars; p.seenAt = w.time; p.lastSeenX = p.ped.x; p.lastSeenY = p.ped.y;
      if (p.custody) { p.custody = null; p.ped.cuffed = false; }
      w.step();
      let army = 0;
      for (const vid of w.police) {
        const v = w.get(vid);
        if (!v || !v.ai) continue;
        if (!forces.has(v.id)) forces.set(v.id, v.ai.force);
        if (v.ai.force === 'army') army++;
      }
      armyAtOnce = Math.max(armyAtOnce, army);
      for (const e of w.entities.values()) if (e.kind === K.PED && e.npc && e.npc.role === 'cop' && e.npc.tactic) crews.push([e.archetype, e.weapon, e.npc.tactic]);
    }
    return { forces: [...forces.values()], crews, armyAtOnce };
  };
  const one = look(1, 12);
  assert.ok(one.crews.length && one.crews.every(([, , t]) => t === 'tackle'), '1 star: they tackle');
  assert.ok(!one.forces.some((f) => f === 'swat' || f === 'fbi' || f === 'army'));
  const three = look(3, 15);
  assert.ok(three.crews.every(([, wpn, t]) => (t === 'taser' && (wpn === 'taser' || wpn === 'baton')) || (t === 'fire' && wpn === 'pistol')), '3 stars: tasers, some pistols');
  const four = look(4, 15);
  assert.ok(four.crews.every(([, , t]) => t === 'fire'), '4 stars: they shoot');
  const five = look(5, 40);
  assert.ok(five.forces.includes('fbi') || five.forces.includes('swat'), `5 stars: the FBI and SWAT (${five.forces})`);
  assert.ok(five.armyAtOnce <= 1, 'one army truck at a time');
  assert.ok(five.crews.some(([ar]) => ar === 'agent' || ar === 'swat' || ar === 'soldier'));
});

test('sitting in a stopped car is no escape: the officers drag you out (up to 4 stars)', () => {
  const w = makeWorld(), told = listen(w);
  const { p } = joinPlayer(w);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  const car = w.spawnVehicle('sedan', p.ped.x, p.ped.y, 0, { npcOwned: false });
  vehicles.tryEnter(w, p.ped);
  assert.equal(p.ped.vehId, car.id);
  wanted(w, p, 2);
  assert.ok(until(w, () => p.custody || told(p, /Dragged out/), 70), 'dragged out of the car');
});

test('hiding in a shop is no escape: in through the door after you, and out through it to the car', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  // at the front desk inside the police HQ (a walk-in: walls all round, one doorway)
  const poi = w.map.pois.filter((q) => q.kind === 'police' && q.outside)[0];
  const wi = walkInAt(w.map, poi.x, poi.y + 20);
  assert.ok(wi, 'a walk-in');
  teleport(w, p.ped, poi.x, poi.y + 20);
  // the way in from the street: square up to the door outside, then through it
  const cop = spawnNpc(w, 'cop', wi.x - 60, wi.outY + 30, 'cop');
  assert.ok(!w.map.los(cop.x, cop.y, p.ped.x, p.ped.y), 'walls in the way');
  assert.deepEqual(footWay(w, cop, p.ped.x, p.ped.y), { x: wi.x, y: wi.outY }, 'to the door first');
  teleport(w, cop, wi.x + 2, wi.outY);
  assert.deepEqual(footWay(w, cop, p.ped.x, p.ped.y), { x: wi.x, y: wi.inY }, 'then in');
  w.remove(cop);
  wanted(w, p, 1);
  assert.ok(until(w, () => p.custody, 60), 'they came in and got them');
  assert.ok(until(w, () => p.custody && p.custody.stage !== 'held' && p.custody.stage !== 'fetch' && p.custody.stage !== 'escort', 70), 'walked out to the car');
  assert.ok(!walkInAt(w.map, p.ped.x, p.ped.y) || p.custody.stage === 'cell', 'out of the building');
});
