// Gameplay feel: bailing out, crate capacity, drifting, blood + hurt NPCs, the online player
// list and Dev Debug Mode (nothing done in it is saved).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, store, players, fakeConn, straightRoad } from './helpers.js';
import { VEHICLES } from '../shared/vehicles.js';
import { vehStep, driveInput } from '../shared/physics.js';
import { IN } from '../shared/input.js';
import { BAIL_HURT_SPEED, NPC_CRITICAL, NPC_GRIT } from '../shared/rules.js';
import { K } from '../shared/constants.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as combat from '../server/systems/combat.js';
import * as devmode from '../server/devmode.js';
import { spawnNpc } from '../server/systems/npc.js';
import { createSession } from '../server/session.js';

// a quiet straight bit of road to drive on
function openRoad(w) {
  const r = straightRoad(w.map, 2400, { kind: 'ave' });
  return { x: r.x + 400, y: r.y + 41 };
}

test('bailing out: slow, you roll away unhurt (even off a bike, next to it); fast, it hurts', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openRoad(w);
  const bail = (model, speed) => {
    const v = w.spawnVehicle(model, at.x, at.y, 0, { npcOwned: false });
    teleport(w, p.ped, v.x, v.y);
    p.ped.hp = p.ped.maxHp; p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
    v.vx = speed; v.vy = 0;
    vehicles.exitVehicle(w, p.ped);
    run(w, 3);
    const lost = p.ped.maxHp - p.ped.hp;
    if (!v.removed) w.remove(v);
    p.ped.downUntil = 0; p.ped.tumbleUntil = 0; p.ped.airUntil = 0;
    return lost;
  };
  assert.equal(bail('bike', 220), 0, 'motorcycle at a cruise: no harm');
  assert.equal(bail('bike', 380), 0, 'still fine at a brisk ride');
  assert.equal(bail('sedan', 300), 0, 'car at city speed: just a roll');
  assert.ok(bail('bike', 740) > 15, 'flat out on a bike: badly hurt');
  assert.ok(BAIL_HURT_SPEED > 250);
});

test('every vehicle carries crates: bikes and jet skis one, trucks a few, work trucks more, armored trucks lots', () => {
  for (const [id, d] of Object.entries(VEHICLES)) assert.ok(d.slots.length >= 1, `${id} can carry a crate`);
  for (const id of ['bike', 'jetski', 'speedboat', 'dinghy', 'sports', 'taxi', 'police']) assert.ok(VEHICLES[id].slots.length >= 1, id);
  assert.ok(VEHICLES.pickup.slots.length >= 3, 'pickup: a few');
  assert.ok(VEHICLES.flatbed.slots.length > VEHICLES.pickup.slots.length, 'work truck: more');
  assert.ok(VEHICLES.armored.slots.length > VEHICLES.flatbed.slots.length, 'armored: a lot');
  // slots sit on the vehicle, and crates on them don't overlap
  for (const [id, d] of Object.entries(VEHICLES)) {
    for (const [f, r] of d.slots) assert.ok(Math.abs(f) <= d.L / 2 && Math.abs(r) <= d.W / 2, `${id} slot on the body`);
  }
});

test('driving: the handbrake at speed spins the car round in a skid; brake + steer drifts; the brake alone stops hard', () => {
  const map = { tileAtPx: () => 3, tileAt: () => 3, solidProps: new Map(), w: 512 };
  const d = VEHICLES.sedan;
  const go = (inp, secs = 1) => {
    const s = { x: 0, y: 0, a: 0, vx: d.max * 0.85, vy: 0, av: 0 };
    let lat = 0;
    for (let t = 0; t < secs; t += 0.05) { vehStep(s, typeof inp === 'function' ? inp(s) : inp, 0.05, map, d, {}); lat = Math.max(lat, Math.abs(-s.vx * Math.sin(s.a) + s.vy * Math.cos(s.a))); }
    return { turned: Math.abs(s.a) * 57.3, speed: Math.hypot(s.vx, s.vy), lat };
  };
  const steer = go({ throttle: 1, steer: 1, hb: false }, 0.6);
  const ebrake = go({ throttle: 0, steer: 1, hb: true }, 0.6);
  assert.ok(ebrake.turned > steer.turned * 1.3, `handbrake turn ${ebrake.turned.toFixed(0)} vs plain steer ${steer.turned.toFixed(0)} deg`);
  assert.ok(ebrake.lat > 120, 'the tail slides out');
  const tank = go((s) => driveInput(s, { bits: IN.TANK, mx: 1, my: 1 }), 0.6);
  assert.ok(tank.lat > 100 && tank.turned > 30, 'brake + steer: a drift');
  const stop = go({ throttle: -1, steer: 0, hb: false }, 1);
  assert.ok(stop.speed < 80, 'hard brake');
  // AI drivers never skid by accident: braking into a corner keeps its grip
  const ai = go({ throttle: -0.6, steer: 1, hb: false }, 0.6);
  assert.ok(ai.lat < tank.lat, 'traffic stays planted');
});

test('gunshots: a blood spray off the victim; some people drop at once, some take more; the critically hurt limp off bleeding', () => {
  const w = makeWorld({ npcBudget: 200 });
  const { p } = joinPlayer(w);
  p.ped.weapon = 'pistol'; p.profile.weapons.pistol = 100; p.ped.mag.pistol = 12;
  // grit rolls vary
  const grits = new Set();
  for (let i = 0; i < 60; i++) { const q = spawnNpc(w, 'casual', p.ped.x + 2000, p.ped.y, 'civ'); grits.add(q.grit); w.remove(q); }
  assert.ok(grits.size >= 3, `grit varies (${[...grits]})`);
  assert.ok(NPC_GRIT.length >= 3);
  // shoot a tough one: a spray event, they survive the first shot, then limp away bleeding
  for (const q of w.query(p.ped.x, p.ped.y, 400)) if (q !== p.ped && (q.kind === K.VEH || q.kind === K.PED)) w.remove(q); // a clear line of fire
  const v = spawnNpc(w, 'construction', p.ped.x + 60, p.ped.y, 'civ');
  v.grit = NPC_GRIT[NPC_GRIT.length - 1][0]; v.hp = v.maxHp = 300;
  let spray = 0;
  const emit0 = w.emit.bind(w);
  w.emit = (x, y, ev) => { if (ev.e === 'blood' && ev.g) spray++; emit0(x, y, ev); };
  for (let i = 0; i < 4 && !spray; i++) { p.ped.nextAttack = 0; combat.tryAttack(w, p.ped, Math.atan2(v.y - p.ped.y, v.x - p.ped.x)); }
  w.emit = emit0;
  assert.ok(spray, 'bullet blood spray');
  assert.ok(!v.dead, 'tough enough to take a shot');
  v.hp = v.maxHp * NPC_CRITICAL * 0.6;
  combat.damage(w, v, 1, p.ped, 'gun', 0);
  const x0 = v.x, y0 = v.y;
  let drips = 0;
  const emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { if (ev.e === 'drip') drips++; emit(x, y, ev); };
  run(w, 4);
  assert.equal(v.npc.state, 'limp', 'limping');
  assert.ok(v.bleeding, 'bleeding');
  const moved = Math.hypot(v.x - x0, v.y - y0);
  assert.ok(moved > 20 && moved < 4 * 95 * 0.6, `limps away slowly (${moved.toFixed(0)} px in 4 s)`);
  assert.ok(drips > 0, 'leaves a trail of blood');
});

test('players online: everyone sees names, roles and districts; only devs get positions and ids', () => {
  const w = makeWorld();
  const { p: a } = joinPlayer(w);
  const { p: b } = joinPlayer(w);
  const la = devmode.playerList(w, a);
  assert.equal(la.l.length, 2);
  assert.ok(la.l[0].me, 'you first');
  assert.ok(la.l.every((q) => q.n && q.r && q.d && q.x === undefined && q.id === undefined), 'no positions for regular players');
  devmode.enter(w, a, null);
  const ld = devmode.playerList(w, a);
  assert.ok(ld.dev && ld.l.every((q) => Number.isFinite(q.x) && q.id), 'devs get positions');
  void b;
});

test('Dev Debug Mode: password, nothing saved, leaving restores everything; teleport, bring and grant', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w);
  const { p: other } = joinPlayer(w);
  const sess = createSession(w, conn, { dev: false, maxPlayers: 10, login: () => ({ profile: p.profile, token: 't' }) });
  void sess;
  const real = p.profile;
  real.cash = 1234; real.criminalExp = 50;
  const x0 = p.ped.x, y0 = p.ped.y;
  assert.equal(devmode.tryPassword(w, p, 'nope'), false);
  assert.ok(!p.devMode);
  assert.equal(devmode.tryPassword(w, p, 'godmode'), true, 'GODMODE (any case)');
  assert.ok(p.devMode);
  // cheat away
  p.profile.cash += 99999; p.profile.criminalExp = 9999; p.profile.weapons.rocket = 10;
  p.heat = 200; p.wanted = 5;
  teleport(w, p.ped, x0 + 3000, y0);
  assert.equal(store.get(p.pid).cash, 1234, 'the saved profile never sees it');
  // teleport to another player, and fetch them
  devmode.goTo(w, p, other.pid);
  assert.ok(Math.hypot(p.ped.x - other.ped.x, p.ped.y - other.ped.y) < 80, 'went to them');
  teleport(w, p.ped, x0 + 1500, y0);
  devmode.bring(w, p, other.pid);
  assert.ok(Math.hypot(p.ped.x - other.ped.x, p.ped.y - other.ped.y) < 80, 'brought them');
  devmode.grant(w, p, other.pid);
  assert.ok(other.devMode, 'granted');
  // leave: all back
  devmode.exit(w, p);
  assert.ok(!p.devMode);
  assert.equal(p.profile, real, 'the real profile is back');
  assert.equal(p.profile.cash, 1234);
  assert.equal(p.profile.criminalExp, 50);
  assert.equal(p.profile.weapons.rocket, undefined);
  assert.equal(p.wanted, 0);
  assert.ok(Math.hypot(p.ped.x - x0, p.ped.y - y0) < 1, 'back where they were');
  // disconnecting in dev mode restores too
  const oc = other.profile;
  other.profile.cash += 5000;
  const realOther = store.get(other.pid);
  w.players.get(other.pid).conn = fakeConn();
  players.leave(w, other);
  assert.ok(!other.devMode && other.profile === realOther && other.profile !== oc, 'quit: restored');
});
