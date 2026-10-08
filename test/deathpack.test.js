// The death drop (2026-10-08): everything you carried goes into one backpack whose look goes by what the gear is worth
// (Common to Legendary); the cash falls beside it as a pile of notes anyone scoops up by walking over it. Both stay
// PACK_LIFE_S, blinking at the end, and the owner sees their pack on the radar until someone takes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run } from './helpers.js';
import { K } from '../shared/constants.js';
import { PACK_TIERS, PACK_WIRE, packTier } from '../shared/items.js';
import { PACK_LIFE_S, PACK_BLINK_S } from '../shared/rules.js';
import * as combat from '../server/systems/combat.js';
import * as players from '../server/systems/players.js';
import * as cargo from '../server/systems/cargo.js';

const bagsNear = (w, x, y, r = 80) => [...w.entities.values()].filter((e) => e.kind === K.BAG && Math.hypot(e.x - x, e.y - y) < r);
function kill(w, p) { const x = p.ped.x, y = p.ped.y; combat.damage(w, p.ped, 99999, null, 'crash', 0); return { x, y }; }

test('death pack: the rarity goes by what the gear is worth', () => {
  assert.equal(packTier(0), 1);
  assert.equal(packTier(199), 1);
  assert.equal(packTier(200), 2);
  assert.equal(packTier(800), 3);
  assert.equal(packTier(2500), 4);
  assert.equal(packTier(8000), 5);
  assert.equal(packTier(1e6), 5);
  assert.deepEqual(PACK_TIERS.slice(1).map((t) => t.rarity), ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
});

test('death pack: one backpack with everything you carried, the cash in its own pile beside it', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 640 });
  prof.inventory = { bandage: 2, bass: 3 };
  prof.weapons = { fists: 0, pistol: 24, rocket: 3 };
  const at = kill(w, p);
  assert.equal(prof.cash, 0, 'the cash is gone from you');
  assert.deepEqual(prof.inventory, {}, 'so are your things');
  const near = bagsNear(w, at.x, at.y);
  const pack = near.find((b) => b.pack), pile = near.find((b) => b.cashOnly);
  assert.ok(pack && pile && near.length === 2, 'a backpack and a pile of notes');
  assert.equal(pack.cash, 0, 'no cash in the pack');
  assert.deepEqual(pack.items, { bandage: 2, bass: 3 });
  assert.deepEqual(Object.keys(pack.weapons).sort(), ['pistol', 'rocket']);
  assert.equal(pile.cash, 640);
  assert.equal(pack.tier, packTier(pack.value));
  assert.equal(pack.tier, 4, `a rocket launcher and a pistol make an Epic pack ($${Math.round(pack.value)})`);
  assert.ok(Math.hypot(pile.x - pack.x, pile.y - pack.y) > 10, 'the notes land a step away');
  // on the wire: a pack is PACK_WIRE + its rarity, the notes 0
  assert.equal(cargo.bagWireTier(pack), PACK_WIRE + 4);
  assert.equal(cargo.bagWireTier(pile), 0);
  // the owner sees it on the radar with the time left
  const me = players.buildMe(w, p);
  const ping = me.radar.find((r) => r.k === 'pack');
  assert.ok(ping && ping.t === 4 && Math.abs(ping.s - PACK_LIFE_S) <= 1, 'your pack on your radar');
});

test('death pack: anyone can open it; the notes are scooped up by walking over them; the radar ping goes', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { cash: 300 });
  const b = joinPlayer(w, { cash: 0 });
  a.prof.inventory = { bandage: 1 };
  const at = kill(w, a.p);
  const pack = bagsNear(w, at.x, at.y).find((x) => x.pack), pile = bagsNear(w, at.x, at.y).find((x) => x.cashOnly);
  assert.equal(cargo.bagLabel(pack, b.p).startsWith(`Open ${a.p.name}'s Backpack (Common`), true, cargo.bagLabel(pack, b.p));
  assert.equal(cargo.bagLabel(pack, a.p), 'Pick up your Backpack');
  teleport(w, b.p.ped, pile.x, pile.y);
  run(w, 0.2);
  assert.equal(b.prof.cash, 300, 'scooped up the notes');
  const had = b.prof.inventory.bandage || 0;
  cargo.lootBag(w, b.p, pack);
  assert.equal(b.prof.inventory.bandage, had + 1, 'took what was in the pack');
  assert.ok(!players.buildMe(w, a.p).radar.some((r) => r.k === 'pack'), 'the owner\'s radar ping is gone');
});

test('death pack: it stays PACK_LIFE_S, blinking at the end, then it is gone', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 50 });
  prof.weapons = { fists: 0, rifle: 40 };
  const at = kill(w, p);
  const pack = bagsNear(w, at.x, at.y).find((x) => x.pack);
  assert.ok(!cargo.bagBlinks(w, pack));
  pack.expires = w.time + PACK_BLINK_S - 1;
  assert.ok(cargo.bagBlinks(w, pack), 'blinks in its last seconds');
  pack.expires = w.time + 0.5;
  for (const b of bagsNear(w, at.x, at.y)) b.expires = Math.min(b.expires, w.time + 0.5);
  run(w, 1);
  assert.equal(bagsNear(w, at.x, at.y).length, 0, 'gone');
});

test('death pack: nothing to drop, nothing dropped; cash alone is just the pile', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0 });
  prof.inventory = {}; prof.weapons = { fists: 0 };
  const at = kill(w, p);
  assert.equal(bagsNear(w, at.x, at.y).length, 0);
  const b = joinPlayer(w, { cash: 120 });
  b.prof.inventory = {}; b.prof.weapons = { fists: 0 };
  const at2 = kill(w, b.p);
  const near = bagsNear(w, at2.x, at2.y);
  assert.equal(near.length, 1);
  assert.ok(near[0].cashOnly && near[0].cash === 120);
});
