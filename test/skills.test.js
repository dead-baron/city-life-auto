// Skills (the owner, 10-04 / 10-06: "skills and daily caps... modest gains" - server/systems/skills.js): six skills
// levelled by doing things, each activity capped an in-game day (something else for the skill still counts), a bonus
// never past +15%: harder blows, a longer sprint, a faster stroke, less crash damage, a steadier aim, more health.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { SKILL } from '../shared/rules.js';
import { SKILLS, levelOf, xpTo, bonusOf } from '../shared/skills.js';
import { IN } from '../shared/input.js';
import * as skills from '../server/systems/skills.js';
import * as players from '../server/systems/players.js';
import * as phone from '../server/systems/phone.js';

test('the levels: 0 to 10, each a little more; never past +15%', () => {
  for (let L = 0; L <= SKILL.max; L++) assert.equal(levelOf(xpTo(L)), L);
  assert.equal(levelOf(xpTo(3) - 1), 2);
  assert.equal(levelOf(1e9), SKILL.max);
  assert.equal(bonusOf(0), 0);
  assert.ok(Math.abs(bonusOf(SKILL.max) - SKILL.top) < 1e-12 && SKILL.top <= 0.15, 'the top: +15%');
  assert.equal(bonusOf(99), bonusOf(SKILL.max));
  for (const A of Object.values(SKILL.act)) assert.ok(SKILLS.includes(A.skill) && A.cap > 0 && A.xp > 0);
  for (const k of SKILLS) assert.ok(Object.values(SKILL.act).some((A) => A.skill === k), `${k}: something levels it`);
});

test('the daily cap: one activity tops out for the in-game day, another for the same skill still counts; a new day, again', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const cap = SKILL.act.run.cap;
  let got = 0;
  for (let i = 0; i < 400; i++) got += skills.gain(w, p, 'run', 1);
  assert.equal(got, cap, 'capped');
  assert.ok(p.toasts.some((t) => /that's all from sprinting today/i.test(t.text)), 'told so');
  assert.equal(p.profile.skills.xp.stamina, cap);
  // strength: brawling capped, hauling still counts
  for (let i = 0; i < 100; i++) skills.gain(w, p, 'brawl');
  assert.equal(skills.gain(w, p, 'brawl'), 0);
  assert.equal(skills.gain(w, p, 'haul'), SKILL.act.haul.xp, 'another way still counts');
  // the next in-game day
  w.skillDay = 1000;
  assert.equal(skills.gain(w, p, 'run', 1), SKILL.act.run.xp, 'a new day');
  const pan = phone.handle(w, p, { a: 'skills' });
  assert.equal(pan.t, 'skills');
  assert.equal(pan.list.length, 6);
  assert.equal(pan.list.find((k) => k.k === 'stamina').xp, Math.floor(cap + SKILL.act.run.xp - xpTo(levelOf(cap + SKILL.act.run.xp))));
  assert.equal(pan.today.find((t) => t.a === 'run').left, Math.round(cap - SKILL.act.run.xp));
});

test('what the levels do: more health, a longer sprint, a faster stroke, harder blows; the levels sent to the page', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  assert.equal(p.ped.maxHp, 100);
  const set = (k, L) => { (p.profile.skills ||= { xp: {}, day: -1, today: {} }).xp[k] = xpTo(L); };
  p.profile.skills = { xp: { constitution: xpTo(10) - 5 }, day: -1, today: {} };
  w.skillDay = 7;
  p.profile.skills.day = -1;
  skills.gain(w, p, 'sleep');   // (over the line to level 10)
  assert.equal(skills.level(p, 'constitution'), 10);
  assert.equal(p.ped.maxHp, Math.round(100 * (1 + SKILL.top)), 'more health');
  assert.ok(p.toasts.some((t) => /Constitution up: level 10/.test(t.text)));
  set('stamina', 10); set('swimming', 5); set('strength', 10);
  const mods = players.pedMods(w, p.ped);
  assert.ok(Math.abs(mods.staminaMax - 100 * (1 + SKILL.top)) < 1e-9, 'a longer sprint');
  assert.ok(Math.abs(mods.swimMul - (1 + bonusOf(5))) < 1e-9, 'a faster stroke');
  assert.ok(!mods.energy, 'not the energy drink');
  assert.equal(skills.pedBonus(p.ped, 'strength'), SKILL.top);
  const me = players.buildMe(w, p);
  assert.deepEqual(me.skl, [10, 10, 5, 0, 0, 10], 'the levels for the page');
  // a body after a death: the same health
  p.ped.dead = true;
  players.spawnPlayerPed(w, p, false, { x: p.ped.x, y: p.ped.y });
  assert.equal(p.ped.maxHp, Math.round(100 * (1 + SKILL.top)));
});

test('doing it: sprinting and driving earn their skills', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  let seq = 0;
  for (let i = 0; i < 20 * 4; i++) { p.inputQ.push({ seq: ++seq, bits: IN.SPRINT, mx: i % 40 < 20 ? 1 : -1, my: 0, aim: 0 }); w.step(); }
  assert.ok((p.profile.skills.xp.stamina || 0) > 0.5, `sprinting: stamina (${p.profile.skills.xp.stamina})`);
  const v = w.spawnVehicle('sedan', p.ped.x, p.ped.y, 0, {});
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  v.vx = 400; v.vy = 0;
  const before = p.profile.skills.xp.driving || 0;
  for (let i = 0; i < 20; i++) { p.inputQ.push({ seq: ++seq, bits: 0, mx: 0, my: -1, aim: 0 }); w.step(); }
  assert.ok((p.profile.skills.xp.driving || 0) > before, 'driving: driving');
  run(w, 0.1);
  teleport(w, p.ped, p.ped.x, p.ped.y);
});

test('working out: push-ups from the phone, a press a rep at a steady pace - rushed reps don\'t count, a full set, strength; moving gets you up', async () => {
  const { WORKOUT } = await import('../shared/rules.js');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  phone.handle(w, p, { a: 'workout', k: 'pushups' });
  assert.ok(p.workout && p.ped.gt === 'pushup', 'down for push-ups');
  let seq = 0;
  const press = (bits, mx = 0) => { p.inputQ.push({ seq: ++seq, bits, mx, my: 0, aim: 0 }); w.step(); };
  const wait = (s) => { for (let i = 0; i < Math.round(s * 20); i++) press(0); };
  // rushed: no rep
  press(IN.ACTION); press(0);
  assert.equal(p.workout.reps, 0, 'rushed: no rep');
  let reps = 0;
  for (let r = 0; r < WORKOUT.set && p.workout; r++) { wait(WORKOUT.minGap + 0.15); press(IN.ACTION); reps = p.workout ? p.workout.reps : reps + 1; press(0); }
  assert.ok(!p.workout, 'the set over');
  assert.ok(reps >= 8, `steady reps counted (${reps})`);
  assert.ok((p.profile.skills.xp.strength || 0) >= reps * 0.99, 'strength');
  assert.ok(p.ped.gt !== 'pushup', 'up again');
  // sit-ups, then walking off
  phone.handle(w, p, { a: 'workout', k: 'situps' });
  assert.equal(p.ped.gt, 'situp');
  press(IN.SPRINT, 1);
  assert.ok(!p.workout && p.ped.gt !== 'situp', 'moving: up');
  // too long between reps: over
  phone.handle(w, p, { a: 'workout', k: 'situps' });
  wait(WORKOUT.maxGap + 0.3);
  assert.ok(!p.workout, 'lost the rhythm');
  assert.equal(players.buildMe(w, p).wo, null);
});
