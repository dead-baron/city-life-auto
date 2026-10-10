// The streets coming alive (server/systems/streetlife.js, the owner 2026-10-10): street races at night, police chasing
// getaway cars, armored trucks' runs - and the police going after NPC drivers they see (police.js runCarUnit, task #242).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { DISTRICTS } from '../shared/map.js';
import { IN } from '../shared/input.js';
import { localToWorld } from '../shared/math.js';
import { mulberry32 } from '../shared/rng.js';
import { ARMORED_UNLOCK_S } from '../shared/rules.js';
import { EVENT_KINDS } from '../shared/worldevents.js';
import * as streetlife from '../server/systems/streetlife.js';
import * as police from '../server/systems/police.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as players from '../server/systems/players.js';
import * as events from '../server/systems/events.js';

// a pavement in the middle of Downtown
function downtown(w) {
  const m = w.map;
  let sx = 0, sy = 0, n = 0;
  const pts = [];
  for (let ty = 0; ty < m.h; ty += 2) for (let tx = 0; tx < m.w; tx += 2) {
    if (DISTRICTS[m.dist[ty * m.w + tx]].name !== 'Downtown') continue;
    sx += tx; sy += ty; n++;
    if (m.tiles[ty * m.w + tx] === T.SIDEWALK) pts.push([tx, ty]);
  }
  const cx = sx / n, cy = sy / n;
  pts.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cy) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2));
  return { x: pts[0][0] * 32 + 16, y: pts[0][1] * 32 + 16 };
}
function setup(seed = 1) {
  const w = makeWorld({ npcBudget: 120 });
  const { p } = joinPlayer(w);
  const at = downtown(w);
  teleport(w, p.ped, at.x, at.y);
  streetlife.setRng(mulberry32(seed));
  run(w, 1);
  w.street = { live: [], nextAt: 1e9, last: '' };   // (only what the test starts)
  w.nextHappenAt = 1e9; w.nextPetAt = 1e9;
  return { w, p };
}
// run until done() or s seconds have gone by
function until(w, s, done) { for (let k = 0; k < s * 20; k++) { w.step(); if (done()) return true; } return false; }
const ROADISH = new Set([T.ROAD, T.BRIDGE, T.LOT, T.PLAZA, T.SIDEWALK]);
function hold(w, p, s, bits = IN.ACTION) { for (let k = 0; k < Math.round(s * 20); k++) { players.queueInput(p, { seq: p.ack + 1, bits, mx: 0, my: 0, aim: 0 }); w.step(); } }

test('the three kinds show on the radar and in the feed', () => {
  for (const k of ['streetrace', 'copchase', 'armored']) assert.ok(EVENT_KINDS[k] && EVENT_KINDS[k].color && EVENT_KINDS[k].label, k);
});

test('a street race: a pack of fast cars and bikes flat out along the streets, past the player to a finish line, then they scatter', () => {
  const { w, p } = setup(3);
  const ev = streetlife.startNow(w, 'race', p);
  assert.ok(ev, 'a race starts near the player');
  ev.copsAt = 0;   // (no patrol happening on this one)
  assert.equal(ev.kind, 'streetrace');
  assert.ok(ev.racers.length >= 3 && ev.racers.length <= 5);
  const start = { x: ev.x, y: ev.y };
  assert.ok(Math.hypot(start.x - p.ped.x, start.y - p.ped.y) > 600, 'it starts off screen');
  for (const id of ev.racers) {
    const v = w.get(id);
    assert.ok(['sports', 'bike', 'caferacer'].includes(v.model), v.model);
    assert.ok(v.ai.reckless > 400 && v.ai.goal, 'flat out, somewhere to be');
    assert.ok(w.get(v.seats[0]).npc.racer);
  }
  assert.ok(events.feedFor(w).items.some((f) => f.kind === 'streetrace'), 'in the city feed');
  // they drive the streets, fast
  let onRoad = 0, samples = 0, top = 0;
  const done = until(w, 90, () => {
    if (w.tick % 10 === 0) for (const id of ev.racers) { const v = w.get(id); if (!v || ev.done.includes(id)) continue; samples++; if (ROADISH.has(w.map.tileAtPx(v.x, v.y))) onRoad++; top = Math.max(top, Math.hypot(v.vx, v.vy)); }
    return !streetlife.live(w).includes(ev);
  });
  assert.ok(done, 'the race ends');
  assert.ok(onRoad / samples > 0.9, `on the roads (${onRoad}/${samples})`);
  assert.ok(top > 450, `fast (${top | 0} px/s)`);
  assert.ok(['finished', 'off'].includes(ev.how), ev.how);
  if (ev.how === 'finished') assert.ok(ev.winner);
  // over: ordinary traffic, cleared away out of sight
  for (const id of ev.racers) { const v = w.get(id); if (v) { assert.ok(v.despawnable && !v.onEvent); if (v.ai && v.ai.kind === 'traffic') assert.ok(!v.ai.goal && !v.ai.reckless); } }
});

test('a patrol that happens on a street race goes after a racer - who runs for it', () => {
  const { w, p } = setup(5);
  const ev = streetlife.startNow(w, 'race', p);
  assert.ok(ev);
  ev.copsAt = w.time + 0.1;
  run(w, 1);
  const chased = ev.racers.map((id) => w.get(id)).filter((v) => v && police.carChasers(w, v).length);
  assert.equal(chased.length, 1, 'one squad car, after one racer');
  const unit = police.carChasers(w, chased[0])[0];
  assert.ok(unit.sirenOn, 'sirens on');
  run(w, 1);
  assert.ok(ev.busted, 'the race is busted');
  assert.ok(chased[0].ai.goal !== ev.goal && chased[0].ai.goal !== ev.via, 'the racer runs for it');
});

test('any police car that sees a racer gives chase (task #242)', () => {
  const { w, p } = setup(7);
  const ev = streetlife.startNow(w, 'race', p);
  assert.ok(ev);
  ev.copsAt = 0;
  const r = w.get(ev.racers[0]);
  // a squad car done with its last job, heading off, just behind the racer
  const [x, y] = localToWorld(r.x, r.y, r.a, -150, 0);
  const car = w.spawnVehicle('police', x, y, r.a, {});
  car.ai = { kind: 'police', target: null, mode: 'drive', route: null, routeAt: 0, force: 'police', downSince: w.time };
  w.police.add(car.id);
  teleport(w, p.ped, x + 120, y + 120);   // (someone's watching: it doesn't just vanish)
  until(w, 2, () => !!car.ai.vehTarget);
  assert.ok(car.ai.vehTarget, 'it turns on a racer');
  assert.ok(car.sirenOn);
});

test('a police chase: a getaway car with a squad car on its tail - stopped, the driver is dragged out and cuffed', () => {
  const { w, p } = setup(11);
  const ev = streetlife.startNow(w, 'chase', p);
  assert.ok(ev, 'a chase starts near the player');
  assert.equal(ev.kind, 'copchase');
  const car = w.get(ev.car), unit = w.get(ev.unit), crook = w.get(ev.crook);
  assert.ok(car.ai.reckless > 400, 'the getaway car flat out');
  assert.equal(unit.ai.vehTarget, car.id);
  assert.ok(unit.sirenOn);
  run(w, 4);
  assert.ok(Math.hypot(car.x - unit.x, car.y - unit.y) < 900, 'the squad car keeps up');
  // it's boxed in: stopped dead, the squad car right behind
  car.ai.parkIt = true; car.vx = 0; car.vy = 0;
  const [x, y] = localToWorld(car.x, car.y, car.a, -150, 0);
  teleport(w, unit, x, y); unit.a = car.a; unit.vx = 0; unit.vy = 0;
  const done = until(w, 40, () => ev.arrested);
  assert.ok(done, 'the driver is dragged out, cuffed and taken in');
  assert.ok(crook.removed, 'off the street (into the cells)');
  run(w, 1);
  assert.equal(ev.how, 'arrest');
  assert.ok(!streetlife.live(w).includes(ev));
});

test('a police chase the squad car loses is an escape: the getaway car drives off and is cleared away', () => {
  const { w, p } = setup(13);
  const ev = streetlife.startNow(w, 'chase', p);
  assert.ok(ev);
  const car = w.get(ev.car), unit = w.get(ev.unit);
  run(w, 1);
  // the squad car stuck far behind, out of sight a long while
  teleport(w, unit, car.x + 3000, car.y); unit.vx = 0; unit.vy = 0;
  unit.ai.seenAt = w.time - 60;
  until(w, 5, () => !streetlife.live(w).includes(ev));
  assert.equal(ev.how, 'escaped');
  assert.ok(car.removed || (car.despawnable && !car.onEvent && !car.ai?.reckless));
});

function armored(seed) {
  const { w, p } = setup(seed);
  const ev = streetlife.startNow(w, 'armored', p);
  assert.ok(ev, 'an armored truck starts near the player');
  return { w, p, ev, van: w.get(ev.van) };
}

test('an armored truck: an IronVault van with guards aboard, running between two far-apart valuable places', () => {
  const { w, ev, van } = armored(17);
  assert.equal(ev.kind, 'armored');
  assert.equal(van.model, 'armored');
  const gs = ev.guards.map((id) => w.get(id));
  assert.equal(gs.length, 2);
  for (const g of gs) { assert.equal(g.vehId, van.id); assert.ok(['pistol', 'smg'].includes(g.weapon)); }
  assert.ok(ev.load.length >= 3 && ev.load.length <= 5 && ev.load.every((t) => t >= 1 && t <= 3));
  const run0 = Math.hypot(van.x - ev.goal.x, van.y - ev.goal.y);
  assert.ok(run0 > 2000, `far across the map (${run0 | 0} px)`);
  assert.ok(van.ai.goal === ev.goal && !van.ai.reckless, 'at a steady pace, to where it is going');
  const done = until(w, 300, () => !streetlife.live(w).includes(ev));
  assert.ok(done);
  assert.equal(ev.how, 'delivered');
});

test('an armored truck blown up spills its valuables out of the back as crates', () => {
  const { w, ev, van } = armored(19);
  run(w, 2);
  const n = ev.load.length;
  vehicles.explode(w, van, null);
  run(w, 1);
  const crates = [...w.entities.values()].filter((e) => e.kind === K.CRATE && e.armored === ev.id);
  assert.equal(crates.length, n, 'every crate it carried');
  for (const c of crates) assert.ok(Math.hypot(c.x - van.x, c.y - van.y) < 400 && c.tier >= 1);
  assert.equal(ev.how, 'destroyed');
});

test('attacked, it stops and the guards get out and fight; the attacker is wanted for it', () => {
  const { w, p, ev, van } = armored(23);
  run(w, 1);
  teleport(w, p.ped, van.x + 200, van.y);
  van.hp -= 120; van.lastAttacker = p.ped.id;
  run(w, 1);
  assert.ok(ev.attackedAt, 'attacked');
  for (const id of ev.guards) { const g = w.get(id); assert.ok(!g.vehId, 'out of the truck'); assert.equal(g.npc.state, 'fight'); assert.equal(g.npc.target, p.ped.id); }
  assert.ok(p.wanted > 0, 'police heat');
});

test('the back of a stopped armored truck: hold ACT a few seconds and the crates fall out - the alarm, the guards, the police', () => {
  const { w, p, ev, van } = armored(29);
  run(w, 1);
  // stopped (at the lights, boxed in)
  van.ai.parkIt = true; van.vx = 0; van.vy = 0;
  run(w, 0.5);
  van.vx = 0; van.vy = 0;
  const [bx, by] = localToWorld(van.x, van.y, van.a, -van.def.L / 2 - 22, 0);
  teleport(w, p.ped, bx, by);
  const act = streetlife.interaction(w, p);
  assert.ok(act && /unlock/i.test(act.label), act && act.label);
  const n = ev.load.length;
  // let go too soon: nothing
  hold(w, p, 0.05); hold(w, p, 1); hold(w, p, 0.3, 0);
  assert.ok(!ev.spilled, 'let go: still locked');
  hold(w, p, 0.05); hold(w, p, ARMORED_UNLOCK_S + 0.4);
  assert.equal(ev.spilled, 'unlocked');
  const crates = [...w.entities.values()].filter((e) => e.kind === K.CRATE && e.armored === ev.id);
  assert.equal(crates.length, n);
  for (const c of crates) { const lx = (c.x - van.x) * Math.cos(van.a) + (c.y - van.y) * Math.sin(van.a); assert.ok(lx < 0, 'out of the back'); }
  assert.ok(p.wanted > 0, 'armed robbery: police heat');
  for (const id of ev.guards) { const g = w.get(id); if (g && !g.dead) { assert.ok(!g.vehId); assert.equal(g.npc.state, 'fight'); } }
});

test('now and then one starts near someone in town: one at a time, a race only at night, never the same twice running', () => {
  const { w, p } = setup(31);
  void p;
  w.street.nextAt = w.time;
  w.street.last = 'chase';
  run(w, 1.2);
  const st = w.street;
  assert.equal(st.live.length, 1);
  assert.equal(st.live[0].sl, 'armored', 'not the last kind, and no race by day');
  st.nextAt = w.time;
  run(w, 1.2);
  assert.equal(st.live.length, 1, 'one at a time');
});
