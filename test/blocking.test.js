// Guarding and the plasma blade's deflection (the owner's notes, 2026-10-10; tasks #302, #410): hold the guard (right
// mouse button, LT on foot, the touch aim stick short of firing) with your fists, a bat, a sword, the katana or the
// plasma blade and blows from in front are blocked; the plasma blade held in guard turns most bullets aside - nearly
// all from in front, fewer from the side, none from behind - spinning round to meet them, sparks, the bullet glancing off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { WEAPONS, deflectChance } from '../shared/items.js';
import { GUARD, PLASMA_DEFLECT } from '../shared/rules.js';
import { IN } from '../shared/input.js';
import * as combat from '../server/systems/combat.js';

const evs = (w, e) => w.events.filter((q) => q.ev.e === e).map((q) => q.ev);
// a defender at a quiet spot holding `id`, facing east, and an attacker `gap` px east of them (or west: behind)
function pair(id, aid = 'bat', side = 1, gap = 24) {
  const w = makeWorld();
  const { p } = joinPlayer(w), { p: q } = joinPlayer(w);
  const at = w.map.natureSites.find((s) => s.name === 'Giants Loop');
  teleport(w, p.ped, at.x + 200, at.y - 300);
  teleport(w, q.ped, p.ped.x + side * gap, p.ped.y);
  for (const [pl, wid] of [[p, id], [q, aid]]) { pl.profile.weapons[wid] = WEAPONS[wid].mag ? 60 : 0; pl.ped.weapon = wid; if (WEAPONS[wid].mag) pl.ped.mag[wid] = WEAPONS[wid].mag; }
  p.ped.a = 0; q.ped.a = side > 0 ? Math.PI : 0;
  p.ped.protectUntil = q.ped.protectUntil = 0;
  w.events.length = 0;
  return { w, p, q, d: p.ped, a: q.ped };
}
const guardUp = (w, ped) => { ped.guardUntil = w.time + 0.12; };
let seq = 0;
const send = (w, p, bits, aim = 0, mx = 0, my = 0) => { players.queueInput(p, { seq: p.ack + 1 + (seq++ % 3), bits, mx, my, aim }); w.step(); };

test('guarding: fists, a bat, a sword, the katana and the plasma blade block a blow from in front - a clash, little or nothing gets through', () => {
  for (const id of ['fists', 'bat', 'sword', 'katana', 'plasma']) {
    assert.ok(WEAPONS[id].guard > 0, `${id} can guard`);
    const open = pair(id), shut = pair(id);
    open.w.rand = shut.w.rand = () => 0.5;
    const hp0 = open.d.hp;
    combat.tryAttack(open.w, open.a, Math.PI);
    const took = hp0 - open.d.hp;
    assert.ok(took > 5, `${id}: an open hit lands (${took.toFixed(1)})`);
    guardUp(shut.w, shut.d);
    combat.tryAttack(shut.w, shut.a, Math.PI);
    const blocked = hp0 - shut.d.hp;
    assert.ok(blocked <= took * (1 - WEAPONS[id].guard) + 0.5, `${id}: blocked, ${blocked.toFixed(1)} of ${took.toFixed(1)} gets through`);
    const b = evs(shut.w, 'block')[0];
    assert.ok(b && b.id === shut.d.id && b.w === WEAPONS[id].i, `${id}: the clash`);
    assert.ok(!shut.d.bleeding && !(shut.d.downUntil > shut.w.time) && !evs(shut.w, 'blood').length, `${id}: no stagger, no bleeding`);
    assert.equal(shut.a.combo, 0, 'the combo broken');
  }
  // the plasma blade in guard stops even itself
  const { w, d, a } = pair('plasma', 'plasma');
  guardUp(w, d);
  const hp0 = d.hp;
  combat.tryAttack(w, a, Math.PI);
  assert.equal(d.hp, hp0, 'blade on blade: nothing through');
});

test('guarding: no help against a blow from behind; a knife from behind still kills; guns and tools don\'t guard', () => {
  const back = pair('sword', 'bat', -1);
  back.w.rand = () => 0.5;
  guardUp(back.w, back.d);
  const hp0 = back.d.hp;
  combat.tryAttack(back.w, back.a, 0);
  assert.ok(hp0 - back.d.hp > 10 && !evs(back.w, 'block').length, 'struck from behind: the guard is no help');
  const stab = pair('katana', 'knife', -1);
  guardUp(stab.w, stab.d);
  stab.d.lastCombatAt = -99;
  combat.tryAttack(stab.w, stab.a, 0);
  assert.ok(evs(stab.w, 'block').length === 0, 'no block from behind');
  for (const id of ['pistol', 'rod', 'bow', 'knife']) assert.ok(!WEAPONS[id].guard, `${id}: nothing to block with`);
  assert.ok(GUARD.arc > 1 && GUARD.arc < Math.PI / 2, 'the guard covers the front');
});

test('guarding by input: the block bit with something to block with raises the guard - slower, no striking; with a gun it only aims', () => {
  const { w, p, d } = pair('sword');
  send(w, p, IN.BLOCK | IN.AIMING, 0);
  assert.ok(d.guardUntil > w.time, 'guard up');
  assert.ok(players.pedMods(w, d).speedMul <= GUARD.speed + 1e-9, 'a careful step');
  const next = d.nextAttack;
  send(w, p, IN.BLOCK | IN.AIMING | IN.FIRE, 0);
  assert.equal(d.nextAttack, next, 'no swing while guarding');
  send(w, p, IN.AIMING, 0);
  assert.ok(!(d.guardUntil > w.time), 'let go: down again');
  // walking: the guard slows you
  const fast = pair('sword'), slow = pair('sword');
  for (let i = 0; i < 20; i++) { send(fast.w, fast.p, 0, 0, 0, 1); send(slow.w, slow.p, IN.BLOCK, 0, 0, 1); }
  assert.ok(Math.hypot(slow.d.vx, slow.d.vy) < Math.hypot(fast.d.vx, fast.d.vy) * 0.75, 'guarding: slower on your feet');
  const g = pair('pistol');
  send(g.w, g.p, IN.BLOCK | IN.AIMING, 0);
  assert.ok(!(g.d.guardUntil > g.w.time), 'a gun: no guard');
  const f = pair('fists');
  send(f.w, f.p, IN.BLOCK, 0);
  assert.ok(f.d.guardUntil > f.w.time, 'bare fists: arms up');
});

test('the plasma blade deflects bullets: most from in front while guarding, fewer from the side, none from behind; a spin, sparks, a glance', () => {
  // the odds
  assert.equal(deflectChance(0, true), PLASMA_DEFLECT.front);
  assert.ok(PLASMA_DEFLECT.front >= 0.85 && deflectChance(Math.PI / 3, true) >= 0.85, 'most, within about 60 degrees');
  assert.ok(deflectChance(Math.PI / 2, true) < PLASMA_DEFLECT.front && deflectChance(Math.PI / 2, true) > 0.25, 'fewer from the side');
  assert.equal(deflectChance(Math.PI, true), 0, 'none from behind');
  assert.equal(deflectChance(2.2, true), 0);
  assert.equal(deflectChance(0, false), WEAPONS.plasma.deflect, 'not guarding: now and then');
  // shot at from in front, guarding: turned aside; not guarding, at the same odds roll: hit
  const shoot = (guard, side = 1, roll = 0.6) => {
    const s = pair('plasma', 'pistol', side, 200);
    s.w.rand = () => roll;
    s.d.a = 0; if (guard) guardUp(s.w, s.d);
    const hp0 = s.d.hp;
    combat.tryAttack(s.w, s.a, side > 0 ? Math.PI : 0);
    return { s, hurt: hp0 - s.d.hp, dfl: evs(s.w, 'deflect')[0] };
  };
  const g = shoot(true);
  assert.ok(g.dfl && g.hurt === 0, 'guarding: turned aside');
  assert.ok(typeof g.dfl.g === 'number' && Math.abs(g.dfl.g - g.dfl.a) < 1.3, 'it glances off, back out to one side');
  assert.ok(g.s.d.attackAnimUntil > g.s.w.time, 'the blade whirls round to meet it (the swing pose)');
  const o = shoot(false);
  assert.ok(!o.dfl && o.hurt > 0, 'not guarding: at these odds it hits');
  const b = shoot(true, -1, 0.01);
  assert.ok(!b.dfl && b.hurt > 0, 'from behind: no deflection at all');
  // over many shots from in front, guarding: most turned aside
  const many = pair('plasma', 'pistol', 1, 200);
  let n = 0, turned = 0;
  for (let i = 0; i < 120; i++) {
    many.d.hp = many.d.maxHp = 1e6; many.d.a = 0; guardUp(many.w, many.d); many.d.attackAnimUntil = 0;
    many.a.nextAttack = 0; many.a.mag.pistol = 12; many.w.events.length = 0;
    if (!combat.tryAttack(many.w, many.a, Math.PI)) continue;
    if (!evs(many.w, 'shot').some((e) => e.h === 1)) continue;   // (a miss from the spread)
    n++; if (evs(many.w, 'deflect').length) turned++;
  }
  assert.ok(n > 60 && turned / n > 0.75, `guarding, facing the shooter: ${turned} of ${n} turned aside`);
});
