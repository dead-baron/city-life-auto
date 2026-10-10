// Blades: knives, the sword and the katana slash; a killing blow is now and then a finisher, and the cut down fall in
// different ways; the plasma blade cuts through anything, sears instead of bleeding, turns bullets aside and leaves two
// halves; the hooded stranger who sells it, out in the wilds at night.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { WEAPONS, SHOPS } from '../shared/items.js';
import { PLASMA_PRICE } from '../shared/rules.js';
import * as combat from '../server/systems/combat.js';
import * as npc from '../server/systems/npc.js';
import * as reactions from '../server/systems/reactions.js';
import * as wanderer from '../server/systems/wanderer.js';
import * as devCmds from '../server/dev.js';

const evs = (w, e) => w.events.filter((q) => q.ev.e === e).map((q) => q.ev);
// a player with a blade and someone standing in front of them (east)
function duel(id) {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = w.map.natureSites.find((q) => q.name === 'Giants Loop');
  teleport(w, p.ped, at.x + 200, at.y - 300);
  p.profile.weapons[id] = 0; p.ped.weapon = id; p.ped.a = 0;
  const v = npc.spawnNpc(w, 'casual', p.ped.x + 22, p.ped.y);
  v.npc.state = 'idle';
  w.events.length = 0;
  return { w, p, v };
}

test('blades: a killing blow can be a finisher - a stab with a knife, a slash with a sword - and the victim drops where they stand', () => {
  for (const [id, k] of [['knife', 'stab'], ['sword', 'slash'], ['katana', 'slash']]) {
    const { w, p, v } = duel(id);
    v.hp = 1; v.a = Math.PI;   // (facing the attacker: no backstab)
    w.rand = () => 0;          // (the finisher's roll comes up)
    p.ped.lastCombatAt = w.time; v.npc.state = 'fight'; v.npc.guardNext = 1e9;   // (no guard raised: combat.js npcGuard)
    combat.tryAttack(w, p.ped, 0);
    assert.ok(v.dead, `${id}: down`);
    const fin = evs(w, 'finisher')[0];
    assert.ok(fin && fin.k === k && fin.t === v.id, `${id}: a finishing ${k}`);
    assert.equal(evs(w, 'death')[0].k, k, `${id}: falls from the ${k}`);
    assert.ok(WEAPONS[id].blade > 0 && WEAPONS[id].bleed);
  }
  // cut down without a finisher: sinking to the knees, spun round, slumping back (reactions.died)
  const { w, v } = duel('sword');
  const seen = new Set();
  for (const r of [0.05, 0.25, 0.45, 0.65]) {
    w.events.length = 0; v.dead = false; v.killBlade = 'sword'; v.vx = v.vy = 0;
    w.rand = () => r;
    reactions.died(w, v, 'melee', 0);
    seen.add(evs(w, 'death')[0].k);
  }
  for (const k of seen) assert.ok(['knees', 'spin', 'slump'].includes(k), k);
  assert.ok(seen.size >= 3, `a variety of deaths (${[...seen]})`);
});

test('the plasma blade: one stroke through most people, seared not bleeding, two halves; it turns bullets aside', () => {
  const { w, p, v } = duel('plasma');
  v.hp = v.maxHp = 130;
  combat.tryAttack(w, p.ped, 0);
  assert.ok(v.dead, 'one stroke');
  assert.equal(evs(w, 'death')[0].k, 'halved', 'in two halves');
  assert.ok(evs(w, 'sizzle').length && !evs(w, 'blood').length, 'seared, no blood');
  // shot at from the front while holding it ready: now and then the bullet's turned aside
  const { p: q } = joinPlayer(w);
  teleport(w, q.ped, p.ped.x + 200, p.ped.y);
  q.profile.weapons.pistol = 24; q.ped.weapon = 'pistol'; q.ped.mag.pistol = 12;
  p.ped.a = 0; p.ped.attackAnimUntil = 0;
  w.rand = () => 0;
  const hp0 = p.ped.hp;
  w.events.length = 0;
  combat.tryAttack(w, q.ped, Math.PI);
  assert.equal(p.ped.hp, hp0, 'not a scratch');
  assert.ok(evs(w, 'deflect').length, 'turned aside');
  assert.ok(WEAPONS.plasma.dmg > 120 && WEAPONS.plasma.plasma);
  assert.ok(!Object.values(SHOPS).some((s) => (s.buy || []).some((o) => o.id === 'plasma')), 'no shop sells it');
  assert.ok(SHOPS.pawn.buy.some((o) => o.id === 'sword') && SHOPS.fence.buy.some((o) => o.id === 'katana'), 'swords at the pawn shop, katanas on the black market');
});

test('the hooded stranger: out in the wilds, sells the plasma blade to whoever can pay, gone in a flash if struck', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const s = wanderer.appear(w, null);
  assert.ok(s && s.npc && s.npc.role === 'wanderer', 'he appears');
  const site = w.map.natureSites.reduce((b, q) => (Math.hypot(q.x - s.x, q.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? q : b));
  assert.ok(Math.hypot(site.x - s.x, site.y - s.y) < 400, `at a quiet place (${site.name})`);
  teleport(w, p.ped, s.x - 30, s.y);
  const act = players.findInteraction(w, p);
  assert.ok(act && /hooded stranger.*Plasma Blade/.test(act.label), `the offer (${act && act.label})`);
  p.profile.cash = 0; p.profile.bank = PLASMA_PRICE - 1;
  act.run();
  assert.equal(p.profile.weapons.plasma, undefined, 'not without the money');
  p.profile.bank = PLASMA_PRICE + 500;
  players.findInteraction(w, p).run();
  assert.notEqual(p.profile.weapons.plasma, undefined, 'the blade is yours');
  assert.equal(p.ped.weapon, 'plasma');
  assert.equal(p.profile.bank, 500);
  // strike at him: nothing there
  combat.damage(w, s, 10, p.ped, 'melee', 0);
  assert.ok(!w.get(s.id) && !w.wanderer, 'gone in a flash');
  assert.ok(w.wandererNext > w.time, 'and not back for a long while');
});

test('the debug menu\'s practice dummies: people standing still in front of you (one blow each at hp 1)', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = w.map.natureSites.find((q) => q.name === 'Giants Loop');
  teleport(w, p.ped, at.x + 200, at.y - 300);
  p.ped.a = 0;
  const before = new Set(w.entities.keys());
  devCmds.command(w, p, 'dummy', { hp: 1 });
  const dummies = [...w.entities.values()].filter((e) => !before.has(e.id) && e.npc);
  assert.equal(dummies.length, 3, 'three of them');
  for (const d of dummies) assert.ok(d.x > p.ped.x && Math.hypot(d.x - p.ped.x, d.y - p.ped.y) < 80 && d.hp === 1, 'just ahead, one hit from down');
  for (let i = 0; i < 40; i++) w.step();
  for (const d of dummies) assert.ok(Math.hypot(d.x - d.npc.desk.x, d.y - d.npc.desk.y) < 8, 'they stay put');
  p.profile.weapons.sword = 0; p.ped.weapon = 'sword'; p.ped.nextAttack = 0;
  combat.tryAttack(w, p.ped, 0);
  assert.ok(dummies.some((d) => d.dead), 'one blow');
});
