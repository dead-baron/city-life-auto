// Flying (shared/flight.js, server/systems/aircraft.js): a helicopter spools up, lifts off, hovers, moves, lands; a light
// plane needs its runway to take off and stalls when slow; a crash wrecks it; the parked ones are where they should be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { VEHICLES } from '../shared/vehicles.js';
import { flightStep, flightInput, FLY, airfields, altByte, altOfByte, isAir } from '../shared/flight.js';
const vehicles = await import('../server/systems/vehicles.js');
const net = await import('../server/net.js');

// a bare map: every tile `t` (3 a road), nothing standing on it
const bare = (t = T.ROAD) => ({ tileAtPx: () => t, tileAt: () => t, inside: () => true, idx: (x, y) => y * 4096 + x, bld: { [0]: -1 }, buildings: [], dist: new Uint8Array(1), solidProps: new Map(), w: 4096, h: 4096 });
const fly = (s, def, inp, secs, map = bare()) => { let worst = { hit: 0, sink: 0 }; for (let t = 0; t < secs; t += 0.05) { const o = flightStep(s, flightInput(s, inp, def), 0.05, map, def, true); worst = { hit: Math.max(worst.hit, o.hit), sink: Math.max(worst.sink, o.sink), stall: worst.stall || o.stall }; } return worst; };
const still = () => ({ x: 1000, y: 1000, a: 0, vx: 0, vy: 0, av: 0 });

test('a helicopter spools up, lifts off straight up, hovers, flies where the stick points and lands softly', () => {
  const d = VEHICLES.heli, s = still();
  fly(s, d, { bits: IN.CLIMB, mx: 0, my: 0 }, 1.5);
  assert.equal(s.alt, 0, 'still spooling up: on the ground');
  fly(s, d, { bits: IN.CLIMB, mx: 0, my: 0 }, 4);
  assert.ok(s.alt > 150, `up it goes (${s.alt.toFixed(0)} px)`);
  assert.ok(Math.hypot(s.vx, s.vy) < 1, 'straight up');
  fly(s, d, { bits: 0, mx: 0, my: 0 }, 1.5);
  const h = s.alt;
  fly(s, d, { bits: 0, mx: 0, my: 0 }, 3);
  assert.ok(Math.abs(s.alt - h) < 6, 'hovers');
  fly(s, d, { bits: 0, mx: 1, my: 0 }, 4);
  assert.ok(s.vx > 350 && s.x > 1800, `flies east (${s.vx.toFixed(0)} px/s)`);
  fly(s, d, { bits: 0, mx: 0, my: 1 }, 3);
  assert.ok(s.vy > 200 && Math.abs(Math.sin(s.a) - 1) < 0.3, 'turns south after the stick');
  fly(s, d, { bits: 0, mx: 0, my: 0 }, 4);
  const w = fly(s, d, { bits: IN.DESCEND, mx: 0, my: 0 }, 8);
  assert.equal(s.alt, 0, 'down');
  assert.ok(w.sink > 0 && w.sink <= FLY.HARD_SINK, `a soft touch (${w.sink.toFixed(0)} px/s)`);
  // a keyboard's car-style: W tilts along the nose, A/D yaw
  const k = still();
  fly(k, d, { bits: IN.CLIMB, mx: 0, my: 0 }, 5);
  fly(k, d, { bits: IN.TANK, mx: 1, my: -1 }, 1);
  assert.ok(k.a > 1 && Math.hypot(k.vx, k.vy) > 150, `W forward, D turns it right (${k.a.toFixed(2)} rad, ${Math.hypot(k.vx, k.vy).toFixed(0)} px/s)`);
});

test('without power a helicopter comes down hard', () => {
  const d = VEHICLES.heli, s = { ...still(), alt: 600, spool: 1 };
  let worst = 0;
  for (let t = 0; t < 12 && (s.alt > 0 || t < 0.1); t += 0.05) worst = Math.max(worst, flightStep(s, flightInput(s, { bits: 0, mx: 0, my: 0 }, d), 0.05, bare(), d, false).sink);
  assert.equal(s.alt, 0);
  assert.ok(worst > FLY.CRASH_SINK, `a crash (${worst.toFixed(0)} px/s)`);
});

test('a light plane takes off from a runway, not from the grass; it banks to turn and stalls when slow', () => {
  const d = VEHICLES.plane;
  const go = { bits: IN.TANK | IN.CLIMB, mx: 0, my: -1 };
  const r = still();
  fly(r, d, go, 14, bare(T.LOT));
  assert.ok(r.alt > 120, `off the runway and climbing (${r.alt.toFixed(0)} px)`);
  const g = still();
  fly(g, d, go, 20, bare(T.GRASS));
  assert.equal(g.alt, 0, 'the grass holds it back below its lift-off speed');
  assert.ok(Math.hypot(g.vx, g.vy) < d.vr, 'too slow to rotate');
  // in the air: the wheel banks it and it turns
  const a0 = r.a;
  fly(r, d, { bits: IN.TANK, mx: 1, my: 0 }, 2, bare(T.LOT));
  assert.ok(r.bank > 0.4 && r.a - a0 > 0.5, 'banks right and turns');
  // throttled right back it slows below the stall speed and sinks
  const st = { ...still(), alt: 500, vx: 420, spool: 0.6 };
  const w = fly(st, d, { bits: IN.TANK, mx: 0, my: 1 }, 3, bare(T.LOT));
  assert.ok(w.stall, 'stalled');
  assert.ok(st.alt < 420, `the nose drops, it sinks (${st.alt.toFixed(0)} px up)`);
});

test('low down an aircraft hits the buildings taller than it is; high enough it flies over them', () => {
  const d = VEHICLES.heli;
  // a block of building tiles from x 1200 on (a tall one: the towers)
  const map = bare(T.ROAD);
  map.tileAt = (tx) => (tx >= 38 ? T.BUILDING : T.ROAD); map.tileAtPx = (x) => map.tileAt(Math.floor(x / 32));
  map.bld = new Proxy({}, { get: () => 0 }); map.buildings = [{ id: 0, tx: 38, ty: 0, tw: 10, th: 10, kind: 'office' }]; map.dist = { [0]: 2 };
  const lo = { ...still(), alt: 80, spool: 1 };
  const w = fly(lo, d, { bits: 0, mx: 1, my: 0 }, 3, map);
  assert.ok(w.hit > 0 && lo.x < 38 * 32, 'bumped off its side');
  const hi = { ...still(), alt: 900, spool: 1 };
  fly(hi, d, { bits: 0, mx: 1, my: 0 }, 3, map);
  assert.ok(hi.x > 38 * 32 + 200, 'over the top');
  // and it can set down on the roof
  fly(hi, d, { bits: 0, mx: 0, my: 0 }, 3, map);
  fly(hi, d, { bits: IN.DESCEND, mx: 0, my: 0 }, 12, map);
  assert.ok(hi.alt > 100 && Math.abs(hi.vz) < 1, `on the roof (${hi.alt.toFixed(0)} px up)`);
});

test('the server: parked aircraft at the pads and the apron; flying one, the altitude on the wire; jumping out hurts', () => {
  const w = makeWorld();
  run(w, 0.2);
  const air = [...w.entities.values()].filter((e) => e.kind === K.VEH && isAir(e.def));
  const af = airfields(w.map);
  assert.ok(af.pads.some((p) => p.kind === 'police') && af.pads.some((p) => p.kind === 'hospital' && p.roof), 'pads at the police HQ and on a hospital roof');
  assert.ok(air.some((v) => v.def.id === 'plane') && air.some((v) => v.def.id === 'policeheli') && air.some((v) => v.def.id === 'heli'), `parked: ${air.map((v) => v.def.id).join(', ')}`);
  for (const v of air) assert.ok(v.npcOwned || v.def.police, 'taking one is stealing it');
  // fly the airport's helicopter
  const v = air.find((q) => q.def.id === 'heli');
  const { p } = joinPlayer(w);
  p.ped.x = v.x + 40; p.ped.y = v.y; w.place(p.ped);
  let seq = 0;
  const send = (bits, mx = 0, my = 0, secs = 0.05) => { for (let t = 0; t < secs; t += 0.05) { p.inputQ.push({ seq: ++seq, bits, mx, my, aim: 0 }); w.step(); } };
  send(IN.VEHICLE); send(0);
  assert.equal(p.ped.vehId, 0, 'Safety mode asks first: taking it is theft (safety.js - on for a new character)');
  send(IN.VEHICLE); send(0);
  assert.equal(p.ped.vehId, v.id, 'in');
  assert.ok(v.stolenBy && v.stolenBy.has(p.pid), 'taken (a theft: vehicles.js tryEnter)');
  send(IN.CLIMB, 0, 0, 6);
  assert.ok(v.alt > 150, `flying (${v.alt.toFixed(0)} px)`);
  const [, , , extra] = net._fields(w, v);
  assert.equal(altOfByte(extra), altOfByte(altByte(v.alt)), 'the altitude rides in the extra byte');
  assert.ok(Math.abs(altOfByte(extra) - v.alt) <= FLY.ALT_Q, 'to the nearest step');
  // out in the air: the first press warns, the second jumps - and it hurts
  const hp = p.ped.hp;
  send(IN.VEHICLE); send(0);
  assert.equal(p.ped.vehId, v.id, 'warned first');
  send(IN.VEHICLE); send(0);
  assert.equal(p.ped.vehId, 0, 'jumped');
  run(w, 2.5);
  assert.ok(p.ped.dead || p.ped.hp < hp - 20, 'a long way down');
  // nobody at the controls: it comes down and is wrecked
  run(w, 8);
  assert.ok(v.wreckAt || v.removed, 'crashed');
});

test('the attack helicopter: its pilot fires missiles (the bazooka\'s rocket) from the pods, one every so often', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const v = w.spawnVehicle('gunship', p.ped.x + 200, p.ped.y, 0, { npcOwned: false });
  v.alt = 950; v.spool = 1;   // (above every roof)
  v.seats[0] = p.ped.id; p.ped.vehId = v.id; p.ped.seat = 0;
  let seq = 0;
  const rockets = () => [...w.entities.values()].filter((e) => e.kind === K.PROJ && e.weapon === 'rocket').length;
  for (let i = 0; i < 4; i++) { p.inputQ.push({ seq: ++seq, bits: IN.FIRE | IN.AIMING, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.ok(v.pod === 1 && rockets() <= 1, 'one missile away (then the pods reload)');   // (it may already have struck something)
  const first = v.missileAt;
  for (let i = 0; i < 12; i++) { p.inputQ.push({ seq: ++seq, bits: IN.FIRE | IN.AIMING, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.ok(v.missileAt > first, 'and another once the pods have reloaded');
  assert.ok(v.alt > 900, 'still flying');
  assert.equal(v.hp, v.def.hp, 'its own missiles never hurt it (they used to blow it up when they struck right under it)');
});

test('a blast on the ground doesn\'t reach an aircraft well above it, but one just off the ground is hit', async () => {
  const combat = await import('../server/systems/combat.js');
  const { WEAPONS } = await import('../shared/items.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const hi = w.spawnVehicle('heli', p.ped.x + 400, p.ped.y, 0, { npcOwned: false }); hi.alt = 600; hi.spool = 1;
  const lo = w.spawnVehicle('heli', p.ped.x + 900, p.ped.y, 0, { npcOwned: false }); lo.alt = 10; lo.spool = 1;
  const R = WEAPONS.rocket;
  combat.blast(w, hi.x, hi.y, R.radius, R.dmg, null, 0, true, 0);
  combat.blast(w, lo.x, lo.y, R.radius, R.dmg, null, 0, true, 0);
  assert.equal(hi.hp, hi.def.hp, 'high up: untouched');
  assert.ok(lo.wreckAt || lo.hp < lo.def.hp, 'just off the ground: hit');
});
