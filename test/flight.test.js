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
  run(w, 4);   // (all the way down, no parachute: test/skydive.test.js)
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
  // its missile on the wire: its height (extra, in the altitude's steps) - from the gunship's, gliding down to where it lands
  const pr = w.spawnProjectile(p.ped.id, v.x, v.y, 0, 900, 1100, 'rocket');
  pr.air = true; pr.alt0 = v.alt;
  assert.equal(altOfByte(net._fields(w, pr)[3]), altOfByte(altByte(v.alt)), 'fired: at the gunship\'s height');
  pr.dist = 550;
  assert.ok(Math.abs(altOfByte(net._fields(w, pr)[3]) - v.alt / 2) <= FLY.ALT_Q, 'half way: half way down');
  const bullet = w.spawnProjectile(p.ped.id, v.x, v.y, 0, 900, 1100, 'rocket');
  assert.equal(net._fields(w, bullet)[3], 0, 'one fired on the ground: on the ground');
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

// The owner, flying the helicopter (2026-10-11): "I think it's also hitting things on the ground as I fly by even though
// I'm up in the air." Low over a street (60 px: over a lamp post's top, under a tree's): the server's flight is the
// page's prediction step for step (no corrections), and nothing down there - the street furniture, a parked car, someone
// standing in the road, a crate - touches it or is touched by it.
test('flying low over a street: nothing on the ground touches it, and the page predicts the server step for step', async () => {
  const { straightRoad } = await import('./helpers.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  p.profile.safety = false;
  const r = straightRoad(w.map, 1400);
  assert.ok(r, 'a long straight street');
  const v = w.spawnVehicle('heli', r.x + 120, r.y, 0, { npcOwned: false });
  v.alt = 60; v.spool = 1;
  v.seats[0] = p.ped.id; p.ped.vehId = v.id; p.ped.seat = 0; p.ped.x = v.x; p.ped.y = v.y; w.place(p.ped);
  // in its way, on the ground: a parked car, someone standing in the road, a crate
  const car = w.spawnVehicle('sedan', r.x + 520, r.y, 0, { npcOwned: true });
  const ped = w.spawnPed(r.x + 760, r.y, {});
  const crate = w.spawnCrate(1, r.x + 900, r.y);
  const carAt = { x: car.x, y: car.y, hp: car.hp }, pedHp = ped.hp, crateAt = { x: crate.x, y: crate.y };
  const brokenBefore = (w.brokenProps || new Map()).size;
  // the page's prediction, from the same state
  const s = { x: v.x, y: v.y, a: v.a, vx: v.vx, vy: v.vy, av: v.av || 0, alt: v.alt, vz: v.vz || 0, spool: v.spool, bank: v.bank || 0 };
  let seq = 0, worst = 0;
  for (let i = 0; i < 70; i++) {
    const inp = { seq: ++seq, bits: 0, mx: 1, my: 0, aim: 0 };   // (the stick east, along the street)
    p.inputQ.push(inp); w.step();
    flightStep(s, flightInput(s, inp, v.def), 0.05, w.map, v.def, true);
    worst = Math.max(worst, Math.hypot(s.x - v.x, s.y - v.y), Math.abs(s.alt - v.alt));
  }
  assert.ok(v.x > r.x + 900, `flew along it (${Math.round(v.x - r.x)} px)`);
  assert.ok(worst < 0.01, `the page's prediction matched the server's every step (worst ${worst.toFixed(3)} px)`);
  assert.equal(v.hp, v.def.hp, 'not a scratch on it');
  assert.equal((w.brokenProps || new Map()).size, brokenBefore, 'no street furniture smashed under it');
  assert.ok(Math.hypot(car.x - carAt.x, car.y - carAt.y) < 1 && car.hp === carAt.hp, 'the parked car untouched');
  assert.ok(ped.hp === pedHp && !(ped.downUntil > w.time), 'the person in the road untouched');
  assert.ok(Math.hypot(crate.x - crateAt.x, crate.y - crateAt.y) < 1, 'the crate not shoved');
});

test('an aircraft never leaves tyre marks (the owner, 2026-10-13), sliding or speeding up; a car sliding still does', async () => {
  const { VF } = await import('../shared/constants.js');
  const { straightRoad } = await import('./helpers.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  p.profile.safety = false;
  const r = straightRoad(w.map, 1400);
  const v = w.spawnVehicle('heli', r.x + 120, r.y, 0, { npcOwned: false });
  v.alt = 60; v.spool = 1;
  v.seats[0] = p.ped.id; p.ped.vehId = v.id; p.ped.seat = 0; p.ped.x = v.x; p.ped.y = v.y; w.place(p.ped);
  let seq = 0, flagged = 0;
  for (let i = 0; i < 60; i++) {
    p.inputQ.push({ seq: ++seq, bits: 0, mx: i < 30 ? 1 : 0, my: i < 30 ? 0 : 1, aim: 0 });   // (east, then hard south: it slides)
    w.step();
    if (vehicles.vehFlags(w, v) & VF.DRIFT) flagged++;
  }
  assert.ok(Math.hypot(v.vx, v.vy) > 150, `it flew (${Math.round(Math.hypot(v.vx, v.vy))} px/s)`);
  assert.equal(flagged, 0, 'no tyre smoke or marks from the helicopter');
  const car = w.spawnVehicle('sedan', r.x + 1200, r.y, 0, { npcOwned: true });
  car.vy = 400;   // (sliding sideways)
  w.step();
  assert.ok(vehicles.vehFlags(w, car) & VF.DRIFT, 'a car sliding sideways still marks the road');
});

test('up in the air: out of reach of a swing, of the police dragging the pilot out; nothing smashed under one flown by nobody', async () => {
  const combat = await import('../server/systems/combat.js');
  const police = await import('../server/systems/police.js');
  const props = await import('../server/systems/props.js');
  const { WEAPONS } = await import('../shared/items.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const v = w.spawnVehicle('heli', p.ped.x + 300, p.ped.y, 0, { npcOwned: false });
  v.alt = 80; v.spool = 1;
  const pilot = w.spawnPed(v.x, v.y, {}); v.seats[0] = pilot.id; pilot.vehId = v.id; pilot.seat = 0;
  const cop = w.spawnPed(v.x + 30, v.y, {});
  const swinger = w.spawnPed(v.x - 30, v.y, {});
  assert.equal(combat.meleeVehicle(w, swinger, WEAPONS.bat, 0), null, 'a bat doesn\'t reach it up there');
  police.pullOut(w, cop, pilot, v);
  assert.equal(pilot.vehId, v.id, 'an officer can\'t drag the pilot out of it up there');
  v.alt = 0;
  assert.ok(combat.meleeVehicle(w, swinger, WEAPONS.bat, 0), 'on the ground a bat dents it');
  // flown by nobody (falling, or an NPC pilot's): props.update never smashes what's under an aircraft
  const i = w.map.props.findIndex((q) => q && q.t === 'lamp');
  assert.ok(i >= 0, 'a lamp post');
  const lamp = w.map.props[i];
  v.alt = 50; v.x = lamp.x; v.y = lamp.y; v.vx = 300; v.vy = 0; w.place(v);
  const before = (w.brokenProps || new Map()).size;
  props.update(w, 0.05);
  assert.equal((w.brokenProps || new Map()).size, before, 'the lamp post under it stands');
});

// A page's World v3 window holds the world a region at a time: the places of regions not in yet are holes in map.pois.
// The helipads were worked out over every place and threw on the first hole - the frame died and the screen went black
// (the owner, 2026-10-15: "Spawning a helicopter turned the screen black and froze the game").
test('the page\'s airfields: holes in the places are passed over, and worked out again as more come in', async () => {
  const { pageAirfields } = await import('../client/render/aircraft.js');
  const { generateCity } = await import('../shared/map.js');
  const m = generateCity(1337);
  const full = airfields(m).pads.length;
  const page = Object.create(Object.getPrototypeOf(m));
  Object.assign(page, m);
  page._airfields = null;
  page.pois = m.pois.slice();
  for (let i = 0; i < page.pois.length; i += 3) delete page.pois[i];   // (holes, as a window's)
  const some = pageAirfields(page);
  assert.ok(Array.isArray(some.pads), 'no throw on the holes');
  page.pois = m.pois.slice();
  assert.equal(pageAirfields(page).pads.length, full, 'all the pads once every region is in');
});

// The helipads' H marks (render/aircraft.js drawPads) are drawn while you fly, somewhere to set down; once you've left
// the helicopter they go (the owner, 10-16: "Helipad H symbols stay visible after you leave the helicopter" - the
// aircraft module, loaded once you'd flown, drew them for good).
test('the helipads\' H marks: drawn while you fly, gone once you are on foot again', async () => {
  globalThis.innerWidth ??= 1280;
  const { drawAir, pageAirfields } = await import('../client/render/aircraft.js');
  const { generateCity } = await import('../shared/map.js');
  const m = generateCity(1337), pad = pageAirfields(m).pads[0];
  let marks = 0;
  const g = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'fillRect' ? () => { marks++; } : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  const F = { air: [], view: { x0: pad.x - 400, y0: pad.y - 400, x1: pad.x + 400, y1: pad.y + 400 }, now: 1, dt: 0.016, sky: null };
  drawAir(g, F, { map: m, me: null, pred: { air: true } }, 0.016, false);
  assert.ok(marks > 0, 'flying: the pad\'s H drawn');
  marks = 0;
  drawAir(g, F, { map: m, me: null, pred: null }, 0.016, false);
  assert.equal(marks, 0, 'on foot: no H');
});


// (the owner, b1c: "Helicopters can fly through bridges") below a bridge's deck an aircraft flies into its side - the
// elevated highway's and a bridge's over the water; above it, over it; one that lifted off under the highway gets out
test('below a bridge\'s deck an aircraft hits its side; above it, it flies over; one under a deck gets out', async () => {
  const { DECK_ALT, BRIDGE_ALT } = await import('../shared/flight.js');
  const d = VEHICLES.heli;
  // the elevated highway over the water from x 1200 on (its deck layer), a road bridge's deck from x 2400 on
  const map = bare(T.WATER);
  map.deck = new Proxy({}, { get: (o, k) => (Number(k) % 4096 >= 38 && Number(k) % 4096 < 48 ? 1 : 0) });
  const lo = { ...still(), alt: DECK_ALT - 40, spool: 1 };
  const w = fly(lo, d, { bits: 0, mx: 1, my: 0 }, 3, map);
  assert.ok(w.hit > 0 && lo.x < 38 * 32, `bumped off the highway's side (${Math.round(lo.x)})`);
  const hi = { ...still(), alt: DECK_ALT + 30, spool: 1 };
  fly(hi, d, { bits: 0, mx: 1, my: 0 }, 3, map);
  assert.ok(hi.x > 48 * 32, 'over it');
  const under = { ...still(), x: 43 * 32, alt: 40, spool: 1 };
  fly(under, d, { bits: 0, mx: 1, my: 0 }, 3, map);
  assert.ok(under.x > 48 * 32, `lifted off under it: out the other side (${Math.round(under.x)})`);
  const br = bare(T.WATER);
  br.tileAt = (tx) => (tx >= 38 && tx < 44 ? T.BRIDGE : T.WATER); br.tileAtPx = (x) => br.tileAt(Math.floor(x / 32));
  const skim = { ...still(), alt: BRIDGE_ALT - 6, spool: 1 };
  const w2 = fly(skim, d, { bits: 0, mx: 1, my: 0 }, 2, br);
  assert.ok(w2.hit > 0 && skim.x < 38 * 32, 'skimming the water: into the bridge\'s side');
  const ok = { ...still(), alt: 60, spool: 1 };
  assert.equal(fly(ok, d, { bits: 0, mx: 1, my: 0 }, 3, br).hit, 0, 'over it');
});
