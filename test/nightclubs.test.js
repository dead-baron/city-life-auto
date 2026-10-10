// Nightclubs (task #432, server/systems/nightclubs.js): open from dusk with people dancing, a line outside and bouncers at
// the door; at the end of the night the music stops, the dancers walk out of the door, the line breaks up and the shutter
// comes down; hurt a patron (in the line, inside) and the bouncers - brutes with their fists - come for whoever did it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { DAY_PART_S, DAY_LOOP_S, K } from '../shared/constants.js';
import { CLUB_DANCERS, CLUB_CLOSE_MAX_S, BOUNCER_HP, BOUNCER_STR, BOUNCER_CHASE_PX, PLAYER_GRIT } from '../shared/rules.js';
import * as nightclubs from '../server/systems/nightclubs.js';
import * as combat from '../server/systems/combat.js';
import { mulberry32 } from '../shared/rng.js';

// a club with room for a line of three and two bouncers, the night on, a player near (but not looking at its door, so
// everyone's there at once) - run till they are. (Dancing, task #394: at the peak of the night - half past midnight - and
// one of the hot clubs, so the line's out the door)
const PEAK_T =DAY_PART_S + 0.45 * (DAY_LOOP_S - DAY_PART_S);
function openClub(seed = 1) {
  nightclubs.setRng(mulberry32(seed));
  const w = makeWorld();
  w.loopTime = PEAK_T;
  const c = nightclubs.clubs(w).find((q) => q.line.length >= 3 && q.posts.length === 2);
  assert.ok(c, 'a club with a line and two bouncers');
  c.hot = true;
  const a = joinPlayer(w);
  teleport(w, a.p.ped, c.door.x, c.door.y + c.s * 700);   // (near, out of sight of the door)
  run(w, 3);
  assert.equal(c.state, 'open');
  return { w, c, a };
}
const ents = (w, ids) => ids.map((id) => w.get(id)).filter(Boolean);

test('a club at night: people dancing inside, a line along the front, a bouncer either side of the door', () => {
  const { w, c } = openClub();
  assert.ok(nightclubs.liveList(w).includes(c.gate), 'the music is on');
  assert.ok(w.map.gates[c.gate].props.every((pr) => pr.off), 'the shutter is up');
  const dancers = ents(w, c.dancers), line = ents(w, c.queue), bouncers = ents(w, c.bouncers);
  assert.ok(dancers.length >= CLUB_DANCERS - 2, `dancing (${dancers.length})`);
  for (const d of dancers) { assert.equal(nightclubs.clubAt(w, d.x, d.y), c, 'on the floor inside'); assert.equal(d.gt, 'dance', 'dancing'); }
  assert.equal(line.length, c.line.length, 'a full line');
  line.forEach((e, k) => assert.ok(Math.hypot(e.x - c.line[k].x, e.y - c.line[k].y) < 14 && !nightclubs.clubAt(w, e.x, e.y), 'waiting outside, in their place'));
  assert.equal(bouncers.length, 2);
  for (const b of bouncers) {
    assert.ok(Math.hypot(b.x - b.npc.post.x, b.y - b.npc.post.y) < 14, 'at his post');
    assert.ok(Math.abs(b.x - c.door.x) < 60 && !nightclubs.clubAt(w, b.x, b.y), 'by the door, outside');
    assert.equal(b.weapon, 'fists', 'fists only');
    assert.equal(b.maxHp, BOUNCER_HP);
    assert.ok(b.build.str >= BOUNCER_STR && b.build.poise >= 1.7, 'built like a brute');
  }
});

test('after sunrise the club winds down: the music stops, the dancers walk out of the door, the line breaks up, then the shutter comes down', () => {
  const { w, c, a } = openClub(2);
  const dancers = ents(w, c.dancers), line = ents(w, c.queue), bouncers = ents(w, c.bouncers);
  assert.ok(dancers.length >= 3 && line.length >= 3);
  // watch from across the street: nobody can just vanish now
  teleport(w, a.p.ped, c.door.x + 120, c.door.y + c.s * 260);
  const said = [];
  const bc = w.broadcast.bind(w);
  w.broadcast = (ev) => { if (ev.e === 'club' && ev.i === c.gate) said.push(ev); return bc(ev); };
  w.loopTime = 29;   // (the last second of the night, half an hour after sunrise)
  run(w, 1.5);
  assert.ok(!w.clock.isNight);
  assert.equal(c.state, 'closing');
  assert.deepEqual(said, [{ e: 'club', i: c.gate, on: 0 }], 'the music stopped');
  assert.ok(!nightclubs.liveList(w).includes(c.gate));
  assert.ok(w.map.gates[c.gate].props.every((pr) => pr.off), 'the shutter stays up while they walk out');
  for (const d of dancers) assert.ok(!d.gt && !d.npc.desk && !d.npc.dancer, 'they stopped dancing');
  for (const e of line) assert.ok(!e.npc.guard && e.npc.clubQueue === null, 'out of the line');
  // they walk out by the door (no popping out of sight), then off along the street
  const byDoor = new Map(dancers.map((d) => [d.id, Infinity]));
  let shutAt = -1;
  for (let t = 0; t < (CLUB_CLOSE_MAX_S + 20) * 20 && shutAt < 0; t++) {
    w.step();
    for (const d of dancers) if (w.get(d.id)) byDoor.set(d.id, Math.min(byDoor.get(d.id), Math.hypot(d.x - c.door.x, d.y - c.door.wallY)));
    if (c.state === 'closed') shutAt = w.time;
  }
  assert.ok(shutAt > 0, 'it shut');
  for (const d of dancers) {
    assert.ok(w.get(d.id), 'nobody vanished');
    assert.ok(!nightclubs.clubAt(w, d.x, d.y), 'out of the club');
    assert.ok(byDoor.get(d.id) < 40, `out through the door (${byDoor.get(d.id) | 0} px from it)`);
  }
  run(w, 3);
  assert.ok(w.map.gates[c.gate].props.every((pr) => !pr.off), 'the shutter came down');
  for (const b of bouncers) assert.ok(!b.npc.bouncer && b.npc.role === 'civ', 'the bouncers went home');
  // a while later they're all just people out in the street, going about their day (and the clean-up's)
  const off = new Map();
  for (let t = 0; t < 30 * 20; t++) { w.step(); for (const e of [...dancers, ...line]) off.set(e.id, Math.max(off.get(e.id) || 0, Math.hypot(e.x - c.door.x, e.y - c.door.y))); }
  for (const e of [...dancers, ...line]) {
    if (!w.get(e.id)) continue;
    assert.ok(!e.npc.keep, 'no longer kept');
    assert.ok(e.npc.state !== 'leave' || w.time < e.npc.until, 'not stuck leaving');
    assert.ok(off.get(e.id) > 110, `walked off from the door (${off.get(e.id) | 0} px)`);
    assert.ok(!nightclubs.clubAt(w, e.x, e.y), 'not back in the shut club');
  }
});

test('a bouncer goes after whoever hits someone in the line, with his fists, and back to the door after', () => {
  const { w, c, a } = openClub(3);
  const line = ents(w, c.queue), bouncers = ents(w, c.bouncers), you = a.p.ped;
  const victim = line[line.length - 1];
  // walk up to the back of the line and punch the last one in it
  teleport(w, you, victim.x + 18 * (c.line[0].sd > 0 ? 1 : -1), victim.y);
  you.weapon = 'fists'; you.nextAttack = 0;
  const hp0 = victim.hp;
  assert.ok(combat.tryAttack(w, you, Math.atan2(victim.y - you.y, victim.x - you.x)));
  assert.ok(victim.hp < hp0, 'the punch landed');
  for (const b of bouncers) assert.ok(b.npc.state === 'fight' && b.npc.target === you.id, 'the bouncers are on you');
  // they come over and lay into you (a punch like a brute's: harder than anyone's bare fists)
  const yourHp = you.hp, hp = new Map(line.map((q) => [q.id, q.hp]));
  let by = null, stray = 0;
  for (let t = 0; t < 8 * 20 && !by; t++) {
    w.step();
    if (you.hp < yourHp && w.get(you.lastHitBy)?.npc?.bouncer === c.key) by = w.get(you.lastHitBy);
    for (const q of line) { if (q.hp < hp.get(q.id) && bouncers.some((b) => b.id === q.lastHitBy)) stray++; hp.set(q.id, q.hp); }
  }
  assert.ok(by, 'a bouncer hit you');
  assert.equal(by.weapon, 'fists', 'with his fists');
  assert.ok(yourHp - you.hp > 10 / PLAYER_GRIT * 1.3, `a heavy punch (${(yourHp - you.hp).toFixed(1)})`);
  assert.equal(stray, 0, 'the bouncers hit nobody in the line');
  // run off past their reach: they let you go and go back to the door
  teleport(w, you, c.door.x, c.door.y + c.s * (BOUNCER_CHASE_PX + 600));
  run(w, 12);
  for (const b of bouncers) {
    assert.notEqual(b.npc.state, 'fight', 'they let you go');
    assert.ok(Math.hypot(b.x - b.npc.post.x, b.y - b.npc.post.y) < 20, 'back at the door');
  }
});

test('the bouncers protect anyone inside from anyone - an NPC too - but not from the police or from someone hitting back', () => {
  const { w, c, a } = openClub(4);
  const dancers = ents(w, c.dancers), bouncers = ents(w, c.bouncers), line = ents(w, c.queue);
  const d = dancers[0];
  // an NPC starts on one of the dancers: the bouncers go for the NPC
  const rowdy = w.spawnPed(d.x + 20, d.y, { hp: 100, archetype: 'hustler' });
  rowdy.npc = { role: 'civ', archetype: 'hustler', state: 'wander', fight: 0.5, speed: 1, until: 0 };
  combat.damage(w, d, 8, rowdy, 'melee');
  for (const b of bouncers) assert.ok(b.npc.state === 'fight' && b.npc.target === rowdy.id, 'on the NPC who did it');
  for (const b of bouncers) { b.npc.state = 'wander'; b.npc.target = 0; }
  // you (a player) inside the club, hit by someone: they go for them too
  const you = a.p.ped;
  teleport(w, you, d.x + 30, d.y);
  assert.equal(nightclubs.clubAt(w, you.x, you.y), c);
  combat.damage(w, you, 5, rowdy, 'melee');
  for (const b of bouncers) assert.equal(b.npc.target, rowdy.id, 'a player inside is a patron');
  for (const b of bouncers) { b.npc.state = 'wander'; b.npc.target = 0; }
  // you hit someone in the line, they hit back: the bouncers stay on you, not on them
  const q = line[0];
  teleport(w, you, q.x + 20, q.y);
  combat.damage(w, q, 5, you, 'melee');
  for (const b of bouncers) assert.equal(b.npc.target, you.id);
  combat.damage(w, you, 5, q, 'melee');
  for (const b of bouncers) assert.equal(b.npc.target, you.id, 'hitting back is no new trouble');
  for (const b of bouncers) { b.npc.state = 'wander'; b.npc.target = 0; }
  // an officer at work: none of their business
  const cop = w.spawnPed(q.x - 20, q.y, { hp: 140, archetype: 'cop' });
  cop.npc = { role: 'cop', archetype: 'cop', state: 'wander', fight: 1, speed: 1, until: 0 };
  assert.equal(nightclubs.onHurt(w, line[1], cop, 'melee'), 0);
  for (const b of bouncers) assert.notEqual(b.npc.state, 'fight', 'not after the police');
  // and nobody's a patron of a club that's shut
  w.loopTime = 29; run(w, 1);
  const out = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && !e.dead && !nightclubs.clubAt(w, e.x, e.y) && Math.hypot(e.x - c.door.x, e.y - c.door.y) > 400);
  if (out) assert.equal(nightclubs.onHurt(w, out, rowdy, 'melee'), 0, 'someone down the street is no patron');
});

test('hit a bouncer and both come for you', () => {
  const { w, c, a } = openClub(5);
  const [b1, b2] = ents(w, c.bouncers), you = a.p.ped;
  teleport(w, you, b1.x, b1.y + c.s * 20);
  combat.damage(w, b1, 10, you, 'melee');
  assert.ok(b1.npc.state === 'fight' && b1.npc.target === you.id);
  assert.ok(b2.npc.state === 'fight' && b2.npc.target === you.id, 'his partner too');
});

test('the line moves: the bouncer lets the next one in - they walk in at the door and dance - and the rest step up', () => {
  const { w, c } = openClub(6);
  const first = w.get(c.queue[0]), second = w.get(c.queue[1]);
  assert.ok(c.dancers.length < nightclubs.floorCap(w, c), 'room on the floor');
  let inAt = -1, byDoor = Infinity;
  for (let t = 0; t < 60 * 20 && inAt < 0; t++) {
    w.step();
    if (first.npc.desk) byDoor = Math.min(byDoor, Math.hypot(first.x - c.door.x, first.y - c.door.wallY));
    if (first.npc.desk && nightclubs.clubAt(w, first.x, first.y) === c && Math.hypot(first.x - first.npc.desk.x, first.y - first.npc.desk.y) < 8) inAt = w.time;
  }
  assert.ok(inAt > 0, 'the first in line went in and is dancing');
  assert.ok(byDoor < 40, `through the door (${byDoor | 0} px from it)`);
  assert.ok(c.dancers.includes(first.id) && first.gt === 'dance' && first.npc.clubQueue === null);
  assert.equal(c.queue[0], second.id, 'the next one is at the front now');
  run(w, 4);
  assert.ok(Math.hypot(second.x - c.line[0].x, second.y - c.line[0].y) < 16, 'and stepped up to the door');
  assert.equal(c.queue.length, c.line.length, 'someone joined the back');
});

test('nobody near: the dancers, the line and the bouncers are gone once out of sight; back near, there again', () => {
  const { w, c, a } = openClub(7);
  const all = [...c.dancers, ...c.queue, ...c.bouncers];
  assert.ok(all.length >= 8);
  teleport(w, a.p.ped, c.door.x + 4000, c.door.y + c.s * 3000);
  run(w, 2);
  assert.ok(all.every((id) => !w.get(id)), 'all gone');
  teleport(w, a.p.ped, c.door.x, c.door.y + c.s * 700);
  run(w, 3);
  assert.ok(c.dancers.length >= CLUB_DANCERS - 2 && c.queue.length === c.line.length && c.bouncers.length === c.posts.length, 'back again');
});
