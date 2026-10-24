// The police air unit (server/systems/policeair.js, H66): at a high wanted level a police helicopter takes off from
// headquarters, follows the suspect overhead (clear of the roofs), radios their position to the cars on the ground (the
// law's "seen"), lights them up with its searchlight at night (the light on the wire), can be shot - where art v2 draws it
// too - and brought down, and goes home and lands when they're lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { DAY_PART_S } from '../shared/constants.js';
import { STAR_HEAT } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { POLICE_AIR } from '../shared/rules.js';
import { FLY } from '../shared/flight.js';
const policeair = await import('../server/systems/policeair.js');
const law = await import('../server/systems/law.js');
const combat = await import('../server/systems/combat.js');
const vehicles = await import('../server/systems/vehicles.js');
const npc = await import('../server/systems/npc.js');
const net = await import('../server/net.js');

const w = makeWorld();
run(w, 0.2);
const pad = policeair.hqPad(w.map);
// only the helicopter at work: the squad cars sent for the suspect (and their crews) are taken off the board each tick
const noCars = () => {
  for (const vid of [...(w.police || [])]) { const v = w.get(vid); if (v) { for (const id of v.seats) { const c = id && w.get(id); if (c) w.remove(c); } w.remove(v); } w.police.delete(vid); }
  for (const e of [...w.entities.values()]) if (e.npc && e.npc.role === 'cop' && !e.npc.air) w.remove(e);
  if (w.stops) w.stops.clear();
};
const go = (secs, each) => { for (let i = 0; i < Math.round(secs * 20); i++) { noCars(); if (each) each(); w.step(); } };
const stars = (p, n) => law.addHeat(w, p, STAR_HEAT[n] - p.heat + 1, p.ped.x, p.ped.y);

test('headquarters has a helipad; below the stars no helicopter, at three one takes off from there with its crew', () => {
  assert.ok(pad, 'the police HQ pad (airfields)');
  const { p } = joinPlayer(w);
  p.ped.x = pad.x + 1500; p.ped.y = pad.y + 300; w.place(p.ped);
  stars(p, 2);
  go(1.5);
  assert.ok(!w.policeAir || !w.policeAir.has(p.pid), 'two stars: no helicopter');
  stars(p, POLICE_AIR.stars);
  go(1.5);
  const u = w.policeAir.get(p.pid);
  assert.ok(u, 'three stars: the air unit is up');
  const v = w.get(u.vid);
  assert.equal(v.def.i, VEHICLES.policeheli.i, 'the police helicopter');
  assert.ok(Math.hypot(v.x - pad.x, v.y - pad.y) < 400, 'from headquarters\' pad');
  const crew = v.seats.filter((id) => id).map((id) => w.get(id));
  assert.equal(crew.length, 2, 'a pilot and an observer');
  assert.ok(crew.every((c) => c.npc && c.npc.role === 'cop'), 'police officers');
  assert.ok(v.autopilot, 'flown by its NPC pilot (aircraft.js steps its stick)');
  // following them overhead: up, over to them, circling at its height
  go(25);
  assert.equal(u.mode, 'chase');
  // (circling them - its circle's middle south of them by its drawn height, so art v2 shows it over them: policeair.js)
  const off = (q) => Math.hypot(v.x - q.x, v.y - (q.y + v.alt * FLY.LIFT * 0.8));
  const d = off(p.ped);
  assert.ok(d < POLICE_AIR.orbitR * 2.2, `over the suspect (${Math.round(d)} px off)`);
  assert.ok(v.alt >= POLICE_AIR.alt - 40, `up at its height (${Math.round(v.alt)} px)`);
  assert.ok(v.alt > FLY.HIGH, 'out of reach of the ground');
  // they move off: it follows
  p.ped.x += 700; w.place(p.ped);
  go(6);
  assert.ok(off(p.ped) < POLICE_AIR.orbitR * 2.2, 'it follows them');
  w._t1 = { p, u, v };
});

test('it radios the suspect\'s position to the cars: the law sees them while it does (not inside)', () => {
  const { p, v } = w._t1;
  p.seenAt = -99; p.lastSeenX = 0; p.lastSeenY = 0; p.searchR = 900;
  go(0.1);
  assert.ok(w.time - p.seenAt < 0.2, 'seen from the air');
  assert.ok(Math.abs(p.lastSeenX - p.ped.x) < 1 && Math.abs(p.lastSeenY - p.ped.y) < 1, 'their position passed on');
  assert.equal(p.searchR, 60, 'the search circle tight on them');
  p.ped.hidden = true; p.seenAt = -99;
  go(0.1);
  assert.equal(p.seenAt, -99, 'indoors: the helicopter can\'t see them');
  p.ped.hidden = false;
  go(0.1);
  void v;
});

test('at night its searchlight is on them - on the wire in the damage word\'s top byte', () => {
  const { p, v } = w._t1;
  const day = w.loopTime;
  w.loopTime = DAY_PART_S + 5;
  go(0.2);
  assert.ok(w.clock.isNight, 'night');
  assert.ok(v.lightB & 128, 'the searchlight on');
  assert.ok(Math.hypot(v.searchX - p.ped.x, v.searchY - p.ped.y) < 1, 'on the suspect');
  const parent = net._fields(w, v)[2] >>> 0, b = parent >>> 24;
  assert.equal(b, v.lightB, 'sent in the record');
  // the page's decoding (render/aircraft.js): the way and the distance
  const a = (b & 31) / 32 * Math.PI * 2, dist = ((b >> 5) & 3) * 170;
  const ex = v.x + Math.cos(a) * dist, ey = v.y + Math.sin(a) * dist;
  assert.ok(Math.hypot(ex - p.ped.x, ey - p.ped.y) < 150, `decoded near them (${Math.round(Math.hypot(ex - p.ped.x, ey - p.ped.y))} px)`);
  w.loopTime = day;
  go(0.2);
  assert.ok(!(v.lightB & 128), 'off by day');
});

test('shot at - where art v2 draws it, up the screen by its height - and brought down', () => {
  const { p, u, v } = w._t1;
  // over headquarters' yard (open ground: no wall in the way of the shot), 300 px up: drawn ~200 px up the screen
  v.x = pad.x; v.y = pad.y + 200; v.alt = 300; w.place(v);
  const hp0 = v.hp, dy = v.alt * FLY.LIFT;
  const shooter = npc.spawnNpc(w, 'thug', v.x, v.y, 'civ');
  shooter.weapon = 'rifle';
  // aimed at where art v2 draws it - from the side, along the drawn body (well clear of the ground footprint 200 px below)
  for (const [ox, a] of [[-260, 0], [260, Math.PI], [-200, 0], [200, Math.PI]]) {
    shooter.x = v.x + ox; shooter.y = v.y - dy; shooter.nextAttack = 0; shooter.reloadUntil = 0;
    combat.tryAttack(w, shooter, a);
  }
  assert.ok(v.hp < hp0, `hit up there (${Math.round(hp0)} -> ${Math.round(v.hp)})`);
  vehicles.damageVehicle(w, v, 99999, shooter, true);
  go(12);
  assert.ok(!w.policeAir.has(p.pid), 'the unit is over');
  assert.ok(v.wreckAt || v.removed, 'down');
  assert.ok(p.airNextAt > w.time, 'another isn\'t sent at once');
  w.remove(shooter);
  void u;
});

test('it goes home and lands on its pad when they\'re lost, the crew out', () => {
  const { p } = w._t1;
  p.airNextAt = 0;
  if ((p.wanted | 0) < 3) stars(p, 3);
  const v = policeair.launch(w, p);
  v.x = p.ped.x + 200; v.y = p.ped.y; v.alt = 960; v.spool = 1; w.place(v);   // (up over the tallest roofs)
  const u = w.policeAir.get(p.pid);
  u.mode = 'chase';
  go(1);
  law.clearWanted(w, p);
  go(0.5);
  assert.equal(u.mode, 'home', 'lost: home it goes');
  go(45);
  assert.ok(!w.policeAir.has(p.pid), 'back');
  assert.ok(!v.removed, 'kept');
  assert.ok(Math.hypot(v.x - pad.x, v.y - pad.y) < 200, `on headquarters' pad (${Math.round(Math.hypot(v.x - pad.x, v.y - pad.y))} px off)`);
  assert.ok((v.alt || 0) <= 0.5, 'landed');
  assert.ok(v.seats.every((id) => !id), 'the crew climbed out');
  assert.ok(v.parked, 'parked again');
});

test('the dev command sends it after you', async () => {
  const dev = await import('../server/dev.js');
  const { p } = joinPlayer(w);
  p.ped.x = pad.x + 900; p.ped.y = pad.y; w.place(p.ped);
  p.devMode = true; p.dev = true;
  dev.command(w, p, 'policeair', { near: 1 });
  const u = w.policeAir.get(p.pid);
  assert.ok(u, 'up after you');
  assert.ok(p.wanted >= POLICE_AIR.stars, 'three stars at least');
  const v = w.get(u.vid);
  assert.ok(Math.hypot(v.x - p.ped.x, v.y - p.ped.y) < 400 && v.alt >= 300, 'already in the air close by (near)');
});

test('a suspect fleeing in a helicopter at its height: it keeps its height clear of theirs, and never flies into them (H69)', () => {
  const { p } = joinPlayer(w);
  const x = pad.x + 2600, y = pad.y + 900;
  p.ped.x = x; p.ped.y = y; w.place(p.ped);
  const mine = w.spawnVehicle('heli', x, y, 0, { npcOwned: false });
  mine.alt = POLICE_AIR.alt; mine.spool = 1; mine.seats[0] = p.ped.id; p.ped.vehId = mine.id; p.ped.seat = 0;
  stars(p, POLICE_AIR.stars);
  let u = null, v = null, closest = Infinity;
  go(45, () => {
    mine.alt = POLICE_AIR.alt; mine.vx = 0; mine.vy = 0; mine.x = x; mine.y = y;   // (hovering where they are)
    u ||= w.policeAir && w.policeAir.get(p.pid); v = u && w.get(u.vid);
    if (v && v.alt > FLY.HIGH && Math.hypot(v.x - x, v.y - y) < 260) closest = Math.min(closest, Math.abs(v.alt - mine.alt));
  });
  assert.ok(u && v, 'the air unit is up');
  assert.ok(!mine.wreckAt && !v.wreckAt, 'nobody came down');
  assert.equal(u.mode, 'chase', 'still on them');
  assert.ok(Math.abs(v.alt - mine.alt) >= POLICE_AIR.sep - 30, `its height clear of theirs (${Math.round(v.alt)} vs ${Math.round(mine.alt)})`);
  assert.ok(closest > 50, `close by, never within reach of their height (${closest === Infinity ? 'never close' : Math.round(closest)})`);
  p.ped.vehId = 0; mine.seats[0] = 0; w.remove(mine);
});
