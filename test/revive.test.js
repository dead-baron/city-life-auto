// Downed players, Call for Help, revives (with and without a Revive Kit), finishing, handing over
// a bandage / med kit, the paid ambulance, and the bag's quick slots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { IN } from '../shared/input.js';
import { K } from '../shared/constants.js';
import {
  RESPAWN_SECONDS, HELP_S, REVIVE_KIT_S, REVIVE_HAND_S, REVIVE_LOW_HP, REVIVE_LIMP_S, FINISH_S, AMBULANCE_FEE, REVIVE_KIT_PRICE,
} from '../shared/rules.js';
import * as players from '../server/systems/players.js';
import * as combat from '../server/systems/combat.js';
import * as economy from '../server/systems/economy.js';
import * as revive from '../server/systems/revive.js';

let seq = 1;
// hold `bits` for `secs` (one input per tick)
function hold(w, p, bits, secs) {
  for (let i = 0; i < Math.round(secs * 20); i++) { players.queueInput(p, { seq: seq++, bits, mx: 0, my: 0, aim: 0 }); w.step(); }
}
function pair(w) {
  const a = joinPlayer(w, { cash: 300, bank: 1000 });
  const b = joinPlayer(w, { cash: 0, bank: 0 });
  const sp = w.map.spawns.hospital;
  teleport(w, a.p.ped, sp.x, sp.y + 80); teleport(w, b.p.ped, sp.x + 30, sp.y + 80);
  a.p.ped.protectUntil = 0; b.p.ped.protectUntil = 0;
  return { a, b };
}

test('downed: your things drop in a bag; Call for Help keeps you down for minutes and alerts players nearby', () => {
  const w = makeWorld();
  const { a, b } = pair(w);
  combat.kill(w, a.p.ped, null, 'melee', 0);
  assert.ok(revive.isDowned(a.p.ped), 'down, not gone');
  assert.equal(a.p.profile.cash, 0, 'cash dropped');
  const bagNear = [...w.entities.values()].some((e) => e.kind === K.BAG && Math.hypot(e.x - a.p.ped.x, e.y - a.p.ped.y) < 40);
  assert.ok(bagNear, 'a bag of your things beside you');
  assert.ok(a.p.respawnAt - w.time <= RESPAWN_SECONDS + 0.01);
  const heard = [];
  const orig = w.notify.bind(w);
  w.notify = (p, text, tone) => { if (p === b.p) heard.push(text); return orig(p, text, tone); };
  revive.callHelp(w, a.p);
  assert.ok(a.p.respawnAt - w.time > HELP_S - 1, 'stays down while help comes');
  assert.ok(heard.some((t) => /calling for help/.test(t)), 'the player nearby hears it');
  assert.ok(w.happenings.some((e) => e.kind === 'revive'), 'a "player down" blip on the map');
  // cancelling the request goes back to the countdown you went down with - never sooner (the user, 2026-10-08)
  const downAt = a.p.downMinAt - RESPAWN_SECONDS;
  revive.cancelHelp(w, a.p);
  w.step();
  assert.ok(a.p.ped.dead, 'still down: no waking up early by calling and cancelling');
  assert.ok(Math.abs(a.p.respawnAt - a.p.downMinAt) < 0.01, 'the countdown it went down with');
  assert.ok(!w.happenings.some((e) => e.kind === 'revive'), 'blip gone');
  run(w, downAt + RESPAWN_SECONDS + 0.5 - w.time);
  assert.ok(!a.p.ped.dead, 'woke up when the countdown ran out');
});

test('the death screen: the ambulance without calling for help first; you wake where you last woke up unless you pick another spot', () => {
  const w = makeWorld({ npcBudget: 40 });
  const { a } = pair(w);
  const s = w.map.pois.find((q) => q.kind === 'coffee');
  teleport(w, a.p.ped, s.x, s.y + 40);
  combat.kill(w, a.p.ped, null, 'melee', 0);
  assert.ok(revive.downState(w, a.p).canAmb, 'the ambulance is on offer straight away');
  revive.callAmbulance(w, a.p);
  assert.ok(a.p.amb && a.p.downHelp, 'on its way, and a call for help went out with it');
  revive.cancelAmbulance(w, a.p);
  revive.cancelHelp(w, a.p);
  // pick a hospital other than the pre-selected one, and wake there
  const pick = a.p.respawnChoice === 'h:0' ? 'h:1' : 'h:0';
  a.p.respawnChoice = pick;
  run(w, RESPAWN_SECONDS + 1);
  assert.ok(!a.p.ped.dead, 'woke up');
  assert.equal(a.p.lastSpawnName, w.map.hospitals[Number(pick.slice(2))].name, 'at the spot picked');
  // next time down, that spot is the default
  a.p.ped.protectUntil = 0;
  combat.kill(w, a.p.ped, null, 'melee', 0);
  assert.equal(a.p.respawnChoice, pick, 'pre-selected: where you last woke up');
});

test('revive bare-handed: hold the action button; they come round on low health, limping and bleeding, then heal to half; hand them a bandage', () => {
  const w = makeWorld();
  const { a, b } = pair(w);
  b.p.profile.inventory = { bandage: 2 };
  combat.kill(w, a.p.ped, null, 'melee', 0);
  w.step();
  const act = players.findInteraction(w, b.p);
  assert.ok(act && /revive/i.test(act.label), act && act.label);
  // let go early: nothing happens
  hold(w, b.p, IN.ACTION, 1);
  hold(w, b.p, 0, 0.2);
  assert.ok(a.p.ped.dead, 'letting go cancels');
  hold(w, b.p, IN.ACTION, REVIVE_HAND_S + 0.3);
  const ped = a.p.ped;
  assert.ok(!ped.dead, 'revived');
  assert.ok(ped.hp <= ped.maxHp * (REVIVE_LOW_HP + 0.05), `low health (${ped.hp})`);
  assert.ok(players.pedMods(w, ped).speedMul < 1, 'limping');
  assert.ok(players.pedFlags(w, ped) & 1 << 0 || ped.limpUntil > w.time, 'bleeding trail while limping');
  // hand over a bandage: used on them at once, to half health
  const give = players.findInteraction(w, b.p);
  assert.ok(give && /Give .* Field Bandage/.test(give.label), give && give.label);
  give.run();
  assert.equal(b.p.profile.inventory.bandage, 1);
  assert.ok(ped.hp >= ped.maxHp * 0.5 - 0.01 && !ped.limpUntil, 'patched up to half');
  assert.ok(!a.p.profile.inventory.bandage, 'used on them, not put in their bag');
});

test('revive with a Revive Kit: faster, full health, the kit is kept; the limp heals on its own', () => {
  const w = makeWorld();
  const { a, b } = pair(w);
  b.p.profile.inventory = { revivekit: 1 };
  economy.useItem(w, b.p, 'revivekit');
  assert.equal(b.p.profile.inventory.revivekit, 1, 'not usable on yourself');
  combat.kill(w, a.p.ped, null, 'melee', 0);
  w.step();
  hold(w, b.p, IN.ACTION, REVIVE_KIT_S + 0.3);
  assert.ok(!a.p.ped.dead && a.p.ped.hp === a.p.ped.maxHp, 'full health');
  assert.equal(b.p.profile.inventory.revivekit, 1, 'kit kept');
  // bare-handed limp heals itself to half (let go of the button first: the next hold is a new press)
  hold(w, b.p, 0, 0.2);
  combat.kill(w, a.p.ped, null, 'melee', 0);
  w.step();
  b.p.profile.inventory = {};
  hold(w, b.p, IN.ACTION, REVIVE_HAND_S + 0.3);
  assert.ok(!a.p.ped.dead && a.p.ped.limpUntil > w.time, 'revived bare-handed, limping');
  run(w, REVIVE_LIMP_S + 1);
  assert.ok(a.p.ped.hp >= a.p.ped.maxHp * 0.49 && !a.p.ped.limpUntil, 'healed to half, limp over');
  assert.ok(players.pedMods(w, a.p.ped).speedMul === 1, 'full speed again');
});

test('finishing a downed player: hold the vehicle button over them, or hit them - no revive after', () => {
  const w = makeWorld();
  const { a, b } = pair(w);
  combat.kill(w, a.p.ped, null, 'melee', 0);
  w.step();
  hold(w, b.p, IN.VEHICLE, FINISH_S + 0.3);
  assert.ok(a.p.finished && !revive.isDowned(a.p.ped), 'finished');
  run(w, 4);
  assert.ok(!a.p.ped.dead, 'woke up at a spawn');
  // and a punch on a downed player finishes them too
  combat.kill(w, a.p.ped, null, 'melee', 0);
  teleport(w, b.p.ped, a.p.ped.x + 20, a.p.ped.y);
  w.step();
  combat.damage(w, a.p.ped, 10, b.p.ped, 'melee', 0);
  assert.ok(a.p.finished, 'hit while down');
});

test('a downed wanted player who is revived is still wanted (going down is no escape)', () => {
  const w = makeWorld();
  const { a, b } = pair(w);
  a.p.wanted = 2; a.p.heat = 300;
  combat.kill(w, a.p.ped, null, 'melee', 0);
  assert.equal(a.p.wanted, 0);
  w.step();
  hold(w, b.p, IN.ACTION, REVIVE_HAND_S + 0.3);
  assert.equal(a.p.wanted, 2, 'wanted again');
});

test('ambulance: needs the fee in the bank; drives over unseen, revives you on half health and only then charges you', () => {
  const w = makeWorld({ npcBudget: 40 });
  const { a } = pair(w);
  const s = w.map.pois.find((q) => q.kind === 'coffee');
  teleport(w, a.p.ped, s.x, s.y + 40);
  for (const q of w.players.values()) if (q !== a.p) teleport(w, q.ped, s.x + 9000, s.y); // nobody else around
  combat.kill(w, a.p.ped, null, 'melee', 0);
  revive.callHelp(w, a.p);
  a.p.profile.bank = AMBULANCE_FEE - 1;
  revive.callAmbulance(w, a.p);
  assert.ok(!a.p.amb, 'refused without the money');
  a.p.profile.bank = 1000;
  revive.callAmbulance(w, a.p);
  assert.ok(a.p.amb, 'on its way');
  const v = w.get(a.p.amb.vehId);
  assert.ok(v && Math.hypot(v.x - a.p.ped.x, v.y - a.p.ped.y) > 400, 'starts away from you');
  assert.equal(a.p.profile.bank, 1000, 'nothing charged yet');
  let up = false;
  for (let t = 0; t < 120 && !up; t++) { run(w, 1); up = !a.p.ped.dead; }
  assert.ok(up, 'revived by the paramedics');
  assert.equal(a.p.profile.bank, 1000 - AMBULANCE_FEE, 'charged on success');
  assert.ok(a.p.ped.hp >= a.p.ped.maxHp * 0.5 - 1 && a.p.ped.hp < a.p.ped.maxHp * 0.7, `about half health (${a.p.ped.hp})`);
});

test('the bag: drinks go in the bag, items sit on four quick slots and are used from them', () => {
  const w = makeWorld();
  const { a } = pair(w);
  const prof = a.p.profile;
  prof.inventory = {};
  prof.quick = [null, null, null, null];
  const cafe = w.map.pois.find((q) => q.kind === 'coffee');
  teleport(w, a.p.ped, cafe.x, cafe.y);
  economy.handleMenu(w, a.p, cafe.id, 'i:coffee:6:1');
  assert.equal(prof.inventory.coffee, 1, 'coffee in the bag, not drunk on the spot');
  assert.equal(prof.quick[0], 'coffee', 'and on the first free quick slot');
  economy.setQuick(a.p, 2, 'coffee');
  assert.deepEqual(prof.quick.slice(0, 3), [null, null, 'coffee'], 'moved');
  economy.useItem(w, a.p, 'coffee');
  assert.equal(prof.inventory.coffee, 0);
  assert.ok(a.p.ped.buffs.coffee > w.time, 'drank it');
  // the hospital sells the Revive Kit
  const hosp = w.map.pois.find((q) => q.kind === 'hospital');
  teleport(w, a.p.ped, hosp.x, hosp.y);
  prof.cash = 500;
  economy.handleMenu(w, a.p, hosp.id, `i:revivekit:${REVIVE_KIT_PRICE}:1`);
  assert.equal(prof.inventory.revivekit, 1);
  assert.equal(prof.cash, 500 - REVIVE_KIT_PRICE);
});
