// Lights to carry (task #359: shared/lights.js, server/systems/lights.js): which take a hand and which leave both free,
// batteries running down (a fresh set goes in from the bag, or the light dies), flares and glow sticks burning out, the
// heavy flashlight as a club with a chance to stun, a lantern set down and picked up, and everyone seeing every light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { IN } from '../shared/input.js';
import { LIGHTS, LIGHT_BY_CODE, GLOW_COLS, lightOf } from '../shared/lights.js';
import { FLARE_S, GLOWSTICK_S, BATTERY_S } from '../shared/rules.js';
import { WEAPONS, ITEMS, SHOPS } from '../shared/items.js';
import * as lights from '../server/systems/lights.js';
import * as economy from '../server/systems/economy.js';
import * as combat from '../server/systems/combat.js';

function press(w, p, bits) { players.queueInput(p, { seq: p.ack + 1, bits, mx: 0, my: 0, aim: 0 }); w.step(); }
const sentTo = (conn) => conn.sent.map((m) => (typeof m === 'string' ? JSON.parse(m) : m));
const lastDesc = (conn, id) => { let d = null; for (const m of sentTo(conn)) if (m && m.t === 'sp') for (const e of m.e) if (e.id === id) d = e; return d; };

test('lights: hands-free or not, batteries that run down (a fresh set from the bag, or it dies), sold where it makes sense', () => {
  assert.equal(LIGHTS.headlamp.hand, false); assert.equal(LIGHTS.hardhat.hand, false);
  assert.equal(LIGHTS.flashlight.hand, true); assert.equal(LIGHTS.lantern.hand, true); assert.equal(LIGHTS.heavyflash.hand, true);
  assert.equal(LIGHTS.headlamp.beam, 'cone'); assert.equal(LIGHTS.lantern.beam, 'glow'); assert.ok(LIGHTS.hardhat.hat);
  for (const L of Object.values(LIGHTS)) { assert.ok(L.range > 0 && L.col.length === 3 && (L.fuel > 0 || L.burn > 0), L.id); assert.equal(LIGHT_BY_CODE[L.w], L); assert.ok(ITEMS[L.id] || WEAPONS[L.id], L.id); }
  assert.ok(LIGHTS.flare.burn <= 90 && LIGHTS.flare.burn >= 45, 'a flare: about a minute'); assert.ok(LIGHTS.glowstick.burn >= 120 && LIGHTS.glowstick.burn <= 600, 'a glow stick: a few minutes');
  for (const id of ['headlamp', 'hardhat', 'lantern', 'batteries']) assert.ok(SHOPS.hardware.buy.some((o) => o.id === id), `hardware: ${id}`);
  for (const id of ['flare', 'glowstick', 'batteries']) assert.ok(SHOPS.gasstation.buy.some((o) => o.id === id), `gas station: ${id}`);
  for (const id of ['headlamp', 'lantern', 'flare']) assert.ok(SHOPS.lodge.buy.some((o) => o.id === id) && SHOPS.huntcamp.buy.some((o) => o.id === id), `the outfitters: ${id}`);

  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { quick: [null, null, null, null] });
  const ped = p.ped;
  prof.inventory.headlamp = 1; prof.inventory.lantern = 1;
  // the headlamp leaves both hands free: on with a rifle in hand
  prof.weapons.rifle = 20; combat.selectWeapon(w, ped, 'rifle');
  press(w, p, IN.LIGHT); press(w, p, 0);
  assert.equal(ped.lightCode, LIGHTS.headlamp.w, 'the headlamp on, the rifle in hand');
  assert.equal(ped.weapon, 'rifle');
  // the lantern takes a hand: chosen with the rifle out, it stays dark until the rifle goes away
  economy.useItem(w, p, 'lantern');
  run(w, 0.1);
  assert.ok(prof.light && prof.lightSel === 'lantern' && !ped.lightCode, 'both hands on the rifle: the lantern waits');
  prof.weapons.pistol = 12; combat.selectWeapon(w, ped, 'pistol');
  run(w, 0.1);
  assert.equal(ped.lightCode, LIGHTS.lantern.w, 'a pistol in one hand, the lantern in the other');
  // batteries: a light runs down while it's on; a fresh set goes in from the bag, then it dies
  prof.lightSel = 'headlamp'; lights.sync(w, p);
  assert.equal(ped.lightCode, LIGHTS.headlamp.w);
  prof.lightFuel = { headlamp: 2 }; prof.inventory.batteries = 1;
  run(w, 3.1);
  assert.equal(prof.inventory.batteries, 0, 'a set of batteries used');
  assert.ok(lights.fuelLeft(prof, 'headlamp') > LIGHTS.headlamp.fuel - 5, 'and the light full again');
  assert.equal(ped.lightCode, LIGHTS.headlamp.w, 'still on');
  prof.lightFuel.headlamp = 2;
  run(w, 3.1);
  assert.ok(!ped.lightCode && !ped.flashOn, 'flat batteries: out');
  assert.equal(lights.toggle(w, p, true), false, 'and it won\'t switch on');
  prof.inventory.batteries = 2;
  assert.equal(lights.toggle(w, p, true), true, 'new batteries: on');
  assert.equal(ped.lightCode, LIGHTS.headlamp.w);
  assert.ok(BATTERY_S >= 600, 'batteries run down slowly');
});

test('lights: the heavy flashlight is a strong beam and a club with a chance to stun', () => {
  const H = WEAPONS.heavyflash;
  assert.equal(H.type, 'melee'); assert.ok(H.dmg >= 18 && H.stunChance > 0, 'a solid hit, a chance to stun');
  assert.ok(LIGHTS.heavyflash.range > LIGHTS.flashlight.range && LIGHTS.heavyflash.k > LIGHTS.flashlight.k, 'a stronger beam than the flashlight');
  assert.ok(SHOPS.hardware.buy.some((o) => o.kind === 'weapon' && o.id === 'heavyflash'));
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const { p: q } = joinPlayer(w);
  prof.weapons.heavyflash = 0; combat.selectWeapon(w, p.ped, 'heavyflash');
  press(w, p, IN.LIGHT); press(w, p, 0);
  assert.equal(p.ped.lightCode, LIGHTS.heavyflash.w, 'in hand and on: its beam');
  // a swing at someone in front: hurt, and (the dice going that way) stunned
  teleport(w, q.ped, p.ped.x + 20, p.ped.y);
  p.ped.a = 0;
  const rand = w.rand; w.rand = () => 0;
  const hp0 = q.ped.hp;
  combat.tryAttack(w, p.ped, 0);
  w.rand = rand;
  assert.ok(q.ped.hp < hp0, `hit (${hp0} -> ${q.ped.hp})`);
  assert.ok(q.ped.stunUntil > w.time, 'stunned');
  // put away: no beam (without another light)
  combat.selectWeapon(w, p.ped, 'fists');
  run(w, 0.1);
  assert.ok(!p.ped.lightCode, 'back in the bag: dark');
});

test('lights: flares and glow sticks stay lit where they land for their time; a lantern set down stays lit and can be picked up', () => {
  const w = makeWorld();
  const { p, prof, conn } = joinPlayer(w);
  prof.inventory.flare = 2; prof.inventory.glowstick = 3; prof.inventory.lantern = 1;
  const ev = (k) => w.globalEvents.filter((e) => e.e === k);
  // a flare: struck and thrown ahead, burning about a minute
  economy.useItem(w, p, 'flare');
  assert.equal(prof.inventory.flare, 1, 'one used');
  const fl = [...w.glights.values()].find((g) => g.k === 'flare');
  assert.ok(fl && Math.hypot(fl.x - p.ped.x, fl.y - p.ped.y) > 40, 'thrown a little way');
  const fe = ev('glight').find((e) => e.id === fl.id);
  assert.ok(fe && fe.k === LIGHTS.flare.w && fe.s === FLARE_S, 'everyone told: a flare, burning');
  // glow sticks: snapped and dropped, green, blue, pink in turn
  economy.useItem(w, p, 'glowstick'); economy.useItem(w, p, 'glowstick');
  const gs = [...w.glights.values()].filter((g) => g.k === 'glowstick');
  assert.deepEqual(gs.map((g) => g.c), [0, 1], 'green, then blue');
  assert.ok(GLOW_COLS.length === 3);
  run(w, FLARE_S - 3);
  assert.ok(w.glights.has(fl.id), 'the flare still burning');
  run(w, 4.1);
  assert.ok(!w.glights.has(fl.id), 'burnt out');
  assert.ok(sentTo(conn).filter((m) => m && m.t === 'ev').flatMap((m) => m.l).some((e) => e.e === 'glight' && e.id === fl.id && e.off), 'and everyone told');
  assert.ok(gs.every((g) => w.glights.has(g.id)), 'the glow sticks still glowing');
  run(w, GLOWSTICK_S - FLARE_S + 2);
  assert.ok(gs.every((g) => !w.glights.has(g.id)), 'gone after a few minutes');
  // the lantern: on in your hand, set down (from the bag again), still lit there; picked back up
  economy.useItem(w, p, 'lantern');
  assert.equal(p.ped.lightCode, LIGHTS.lantern.w, 'in hand');
  economy.useItem(w, p, 'lantern');
  assert.equal(prof.inventory.lantern, 0, 'set down');
  assert.ok(!p.ped.lightCode, 'not in your hand any more');
  const lan = [...w.glights.values()].find((g) => g.k === 'lantern');
  assert.ok(lan && !lan.dark, 'lit on the ground');
  run(w, 30);
  assert.ok(w.glights.has(lan.id) && !lan.dark, 'it stays lit');
  const act = players.findInteraction(w, p);
  assert.ok(act && /Pick up the lantern/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(prof.inventory.lantern, 1, 'back in the bag');
  assert.ok(!w.glights.has(lan.id));
  assert.ok(lights.fuelLeft(prof, 'lantern') < LIGHTS.lantern.fuel, 'its batteries as they were');
});

test('lights: other players see your light (its kind, the hard hat) and the ones on the ground', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const o = joinPlayer(w);
  teleport(w, o.p.ped, p.ped.x + 80, p.ped.y);
  prof.inventory.hardhat = 1; prof.inventory.headlamp = 1;
  prof.lightSel = 'hardhat';
  lights.toggle(w, p, true);
  run(w, 0.3);
  let d = lastDesc(o.conn, p.ped.id);
  assert.equal(d.fl, LIGHTS.hardhat.w, 'the hard hat\'s lamp');
  assert.equal(d.hh, 1, 'and the hat itself');
  assert.equal(lightOf(d.fl), LIGHTS.hardhat);
  prof.lightSel = 'headlamp'; lights.sync(w, p);
  run(w, 0.3);
  d = lastDesc(o.conn, p.ped.id);
  assert.equal(d.fl, LIGHTS.headlamp.w, 'the headlamp now');
  assert.ok(!d.hh, 'hat off');
  lights.toggle(w, p, false);
  run(w, 0.3);
  assert.ok(!lastDesc(o.conn, p.ped.id).fl, 'off');
  // the lights on the ground: told as they're set down, and a player joining gets the list
  prof.inventory.glowstick = 1;
  economy.useItem(w, p, 'glowstick');
  run(w, 0.2);
  const evs = sentTo(o.conn).filter((m) => m && m.t === 'ev').flatMap((m) => m.l);
  assert.ok(evs.some((e) => e.e === 'glight' && e.k === LIGHTS.glowstick.w), 'the other player hears of the glow stick');
  const list = lights.groundList(w);
  assert.equal(list.length, 1);
  assert.equal(list[0][1], LIGHTS.glowstick.w);
  assert.ok(list[0][5] > 0 && list[0][5] <= GLOWSTICK_S, 'with its time left');
});
