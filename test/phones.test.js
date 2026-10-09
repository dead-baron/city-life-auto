// People filming with their phones (server npc.js spectacle) and tougher players (combat.js: rules.js PLAYER_GRIT).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { PLAYER_GRIT, PLAYER_GRIT_CAUSE, TRAIN_SURVIVE_HP } from '../shared/rules.js';
import * as npc from '../server/systems/npc.js';
import * as combat from '../server/systems/combat.js';

// an open bit of walkable ground with room round it (a park, a plaza): no walls or water within ~320 px
let SPOT = null;
function openSpot(world) {
  if (SPOT) return SPOT;
  const m = world.map, T0 = 32;
  for (let ty = 300; ty < m.h - 300 && !SPOT; ty += 7) for (let tx = 300; tx < m.w - 300 && !SPOT; tx += 7) {
    let ok = true;
    for (let dy = -10; dy <= 10 && ok; dy++) for (let dx = -10; dx <= 10 && ok; dx++) { const t = m.tiles[(ty + dy) * m.w + tx + dx]; if (PED_BLOCK[t] || t === 3) ok = false; }   // (no walls, water or road)
    if (ok) SPOT = { x: tx * T0 + 16, y: ty * T0 + 16 };
  }
  return SPOT;
}

test('something wild: some of the people round about get their phones out and film it, then put them away', () => {
  const world = makeWorld();
  const at = openSpot(world);
  const { p } = joinPlayer(world);
  teleport(world, p.ped, at.x, at.y + 40);   // (somebody watching: NPCs nobody is near are cleared away)
  const civs = [];
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, r = 180 + (k % 4) * 60; civs.push(npc.spawnNpc(world, 'casual', at.x + Math.cos(a) * r, at.y + Math.sin(a) * r)); }
  for (const c of civs) { c.npc.state = 'wander'; c.npc.speed = 1; }
  npc.spectacle(world, at.x, at.y, { r: 520, near: 120, chance: 2, secs: 8 });
  const filming = civs.filter((c) => c.npc.state === 'film');
  assert.ok(filming.length >= 4, `some film it (${filming.length} of ${civs.length})`);
  for (const c of filming) {
    assert.equal(c.filming, 2, 'the phone held up');
    assert.ok(c.phoneOut > 0);
    assert.ok(Math.hypot(c.x - at.x, c.y - at.y) >= 120, 'nobody films from right on top of it');
  }
  // they stand and face it (and photos flash now and then)
  const before = filming.map((c) => [c.x, c.y]);
  const events = [];
  const emit = world.emit.bind(world);
  world.emit = (x, y, ev) => { events.push(ev); return emit(x, y, ev); };
  run(world, 3);
  filming.forEach((c, i) => {
    if (c.npc.state !== 'film') return;
    assert.ok(Math.hypot(c.x - before[i][0], c.y - before[i][1]) < 20, 'stood still');
    const want = Math.atan2(at.y - c.y, at.x - c.x), d = Math.abs(((c.a - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(d < 0.2, 'facing it');
  });
  if (filming.some((c) => c.npc.photo)) assert.ok(events.some((e) => e.e === 'pflash'), 'a photo flash');
  // the same people aren't asked again straight away
  npc.spectacle(world, at.x, at.y, { r: 520, near: 120, chance: 2, secs: 8 });
  run(world, 11);   // (anyone it does start filming does so for 8 s x 0.7-1.3: up to 10.4 s)
  for (const c of civs) if (!c.dead) { assert.notEqual(c.npc.state, 'film', 'done filming'); assert.ok(!c.filming && !c.phoneOut, 'the phone put away'); }
});

test('trouble coming their way: a filmer runs like anyone else and the phone goes away', () => {
  const world = makeWorld();
  const at = openSpot(world);
  const { p } = joinPlayer(world);
  teleport(world, p.ped, at.x, at.y + 40);
  const c = npc.spawnNpc(world, 'socialite', at.x + 260, at.y);
  c.npc.state = 'wander';
  for (let k = 0; k < 20 && c.npc.state !== 'film'; k++) { c.npc.filmedAt = -1e9; npc.spectacle(world, at.x, at.y, { r: 520, near: 100, chance: 3 }); }
  assert.equal(c.npc.state, 'film');
  npc.onGunfire(world, c.x + 30, c.y, null, 360);
  assert.equal(c.npc.state, 'flee');
  run(world, 0.2);
  assert.ok(!c.filming && !c.phoneOut, 'phone away');
});

test('the network says who is filming (ph 2) and who just has their phone menu open (ph 1)', async () => {
  const net = await import('../server/net.js');
  const world = makeWorld();
  const at = openSpot(world);
  const c = npc.spawnNpc(world, 'casual', at.x + 250, at.y);
  c.npc.state = 'wander';
  for (let k = 0; k < 20 && c.npc.state !== 'film'; k++) { c.npc.filmedAt = -1e9; npc.spectacle(world, at.x, at.y, { r: 520, near: 100, chance: 3 }); }
  assert.equal(c.npc.state, 'film');
  assert.equal(net._descriptor(c).ph, 2, 'filming');
  const { p } = joinPlayer(world);
  const phone = await import('../server/systems/phone.js');
  phone.phoneOut(world, p, true);
  assert.equal(net._descriptor(p.ped).ph, 1, 'the phone menu open');
  phone.phoneOut(world, p, false);
  assert.equal(net._descriptor(p.ped).ph, undefined);
});

test('players are tougher: a police pistol takes more hits, a car at city speed leaves you hurt, not dead', () => {
  const world = makeWorld();
  const { p } = joinPlayer(world);
  const ped = p.ped;
  ped.hp = ped.maxHp;
  combat.damage(world, ped, 20, null, 'gun');
  assert.ok(Math.abs(ped.maxHp - ped.hp - 20 / PLAYER_GRIT) < 0.01, 'a bullet takes less');
  ped.hp = ped.maxHp;
  let hits = 0;
  while (!ped.dead && hits < 20) { combat.damage(world, ped, 20, null, 'gun'); hits++; }
  assert.ok(hits >= 7, `a service pistol: ${hits} hits`);
  // an NPC is no tougher than before
  const civ = npc.spawnNpc(world, 'casual', ped.x + 400, ped.y);
  const hp0 = civ.hp;
  combat.damage(world, civ, 10, null, 'gun');
  assert.equal(hp0 - civ.hp, 10);
  // a car at ~400 px/s: (400 - 100) * 0.17 * sqrt(mass 1.2) ~ 56 before - survivable now
  const w2 = makeWorld();
  const { p: q } = joinPlayer(w2);
  q.ped.hp = q.ped.maxHp;
  combat.damage(w2, q.ped, 56, null, 'vehicle');
  assert.ok(!q.ped.dead && q.ped.hp > q.ped.maxHp * 0.55, `hurt, not dead (${q.ped.hp.toFixed(0)})`);
  assert.ok(Math.abs(q.ped.maxHp - q.ped.hp - 56 / (PLAYER_GRIT * PLAYER_GRIT_CAUSE.vehicle)) < 0.01);
});

test('a train mostly kills - but now and then throws you clear, critically hurt', () => {
  let survived = 0, died = 0;
  for (let k = 0; k < 60; k++) {
    const world = makeWorld();
    const { p } = joinPlayer(world);
    p.ped.hp = p.ped.maxHp;
    combat.damage(world, p.ped, 35 + 420 * 0.35, null, 'train');
    if (p.ped.dead) died++;
    else {
      survived++;
      assert.ok(p.ped.hp <= p.ped.maxHp * TRAIN_SURVIVE_HP + 0.01 && p.ped.hp >= 1, `critically hurt (${p.ped.hp})`);
      assert.ok(p.ped.bleeding, 'bleeding');
    }
  }
  assert.ok(died > survived, `mostly fatal (${died} died, ${survived} survived)`);
  assert.ok(survived >= 5, `sometimes not (${survived} of 60)`);
});
