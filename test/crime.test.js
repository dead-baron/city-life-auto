// Store hold-ups, silenced pistols and quiet knife kills.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { ROB_ALARM_STARS, ROB_RESPONSE_S } from '../shared/rules.js';
import * as combat from '../server/systems/combat.js';
import * as players from '../server/systems/players.js';
import { IN } from '../shared/input.js';
import { spawnNpc } from '../server/systems/npc.js';

let seq = 1;
function aimAt(w, ped, target, secs) {
  for (let i = 0; i < Math.round(secs * 20); i++) {
    players.queueInput(ped.player, { seq: seq++, bits: IN.AIMING, mx: 0, my: 0, aim: Math.atan2(target.y - ped.y, target.x - ped.x) });
    w.step();
  }
}
function clearCams(w, x, y) { const saved = w.map.cameras; w.map.cameras = saved.filter((c) => Math.hypot(c.x - x, c.y - y) > c.r + 400); return () => { w.map.cameras = saved; }; }

test('corner stores and Gas \'n Go stations are walk-in shops with a clerk', () => {
  const w = makeWorld();
  const gas = w.map.pois.filter((q) => q.kind === 'gasstation');
  const conv = w.map.pois.filter((q) => q.kind === 'convenience');
  assert.ok(gas.length >= 2 && conv.length >= 10);
  for (const q of [...gas, ...conv]) assert.ok(w.map.buildings[q.b].walkIn, `${q.label} walk-in`);
  assert.ok(w.map.pumps.length >= gas.length * 2, 'pumps out front');
});

test('robbery: hands up, the cash comes, the alarm trips, squad cars come running', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0 });
  const shop = w.map.pois.find((q) => q.kind === 'convenience');
  const restore = clearCams(w, shop.x, shop.y);
  prof.weapons.pistol = 99; p.ped.mag.pistol = 12; p.ped.weapon = 'pistol';
  teleport(w, p.ped, shop.x, shop.y);
  run(w, 1.2); // the clerk turns up
  const clerk = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && e.npc.desk && Math.hypot(e.x - shop.x, e.y - shop.y) < 120);
  assert.ok(clerk, 'clerk at the counter');
  for (const e of w.query(shop.x, shop.y, 600, K.PED)) if (e !== clerk && e !== p.ped && e.npc) w.remove(e); // nobody else around
  aimAt(w, p.ped, clerk, 0.3);
  assert.ok(p.robbery, 'robbery started');
  assert.ok(clerk.handsUp);
  assert.equal(p.wanted, 0, 'no witness, no report (the clerk doesn\'t count)');
  p.robbery.alarmAt = w.time + 3;
  aimAt(w, p.ped, clerk, 2.5);
  assert.ok(prof.hot > 0, 'cash thrown - into the robbery bag (hot money: test/robbery.test.js)');
  assert.equal(prof.cash, 0, 'not into your cash');
  const before = prof.hot;
  aimAt(w, p.ped, clerk, 1);
  assert.ok(prof.hot > before, 'keeps coming');
  assert.ok(p.wanted >= ROB_ALARM_STARS, 'alarm: wanted');
  assert.ok((w.happenings || []).some((e) => e.kind === 'robbery'), 'robbery on the radar');
  p.ped.protectUntil = 1e9; // the cops will be shooting - stay alive long enough to count them
  let closest = Infinity;
  for (let k = 0; k < (ROB_RESPONSE_S[1] + 1) * 2 && p.robbery; k++) {
    aimAt(w, p.ped, clerk, 0.5);
    for (const id of w.police) { const v = w.get(id); if (v) closest = Math.min(closest, Math.hypot(v.x - shop.x, v.y - shop.y)); }
  }
  assert.ok(closest < 500, `squad cars pull up (closest ${Math.round(closest)} px)`);
  // lower the gun: it's over
  for (let i = 0; i < 44; i++) { players.queueInput(p, { seq: seq++, bits: 0, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.equal(p.robbery, null, 'over (gun lowered or busted)');
  assert.ok(!clerk.handsUp);
  restore();
});

test('silenced pistol: a kill nobody watches goes unreported (a loud one is heard)', () => {
  const w = makeWorld();
  const shoot = (weapon) => {
    const { p } = joinPlayer(w);
    const n = w.map.nodes[60];
    teleport(w, p.ped, n.x + 40, n.y + 40);
    const restore = clearCams(w, p.ped.x, p.ped.y);
    for (const v of w.query(p.ped.x, p.ped.y, 300, K.VEH)) w.remove(v);
    p.profile.weapons[weapon] = 99; p.ped.mag[weapon] = 10; p.ped.weapon = weapon;
    const victim = spawnNpc(w, 'casual', p.ped.x + 60, p.ped.y, 'civ');
    victim.grit = 1; victim.hp = victim.maxHp = 100; // an ordinary person, one shot (a survivor would report you)
    const bystander = spawnNpc(w, 'casual', p.ped.x - 150, p.ped.y, 'civ');
    bystander.a = Math.PI; bystander.npc.state = 'idle'; bystander.npc.until = w.time + 99; // looking the other way
    bystander.npc.snitch = 9; // ...and the sort to call it in if they hear it (who does: test/witnesses.test.js)
    for (let i = 0; i < 6 && !victim.dead; i++) { p.ped.nextAttack = 0; combat.tryAttack(w, p.ped, 0); }
    assert.ok(victim.dead);
    restore();
    return p.heat;
  };
  assert.equal(shoot('spistol'), 0, 'silenced: unnoticed');
  assert.ok(shoot('pistol') > 0, 'loud: heard');
});

test('knife: one stab in the back kills, quietly', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const n = w.map.nodes[60];
  teleport(w, p.ped, n.x + 40, n.y + 40);
  p.profile.weapons.knife = 0; p.ped.weapon = 'knife';
  const victim = spawnNpc(w, 'construction', p.ped.x + 20, p.ped.y, 'civ');
  victim.a = 0; // facing away from us
  p.ped.nextAttack = 0;
  combat.tryAttack(w, p.ped, 0);
  assert.ok(victim.dead, 'one stab');
});
