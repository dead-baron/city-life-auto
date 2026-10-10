// A lost pet handed back to its owner (task #427, server/systems/pets.js): it doesn't vanish - it dashes to them, races
// round them and hops up at them, happy (APOSE.happy on the wire), then trots at their heel as they walk off, and the two
// are cleared away together the usual way once nobody's near.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { APOSE } from '../shared/fauna.js';
import { PET_REWARD } from '../shared/rules.js';
import * as pets from '../server/systems/pets.js';
import { _fields } from '../server/net.js';
import { mulberry32 } from '../shared/rng.js';

// a pet on your collar, walked right up to its owner
function atTheOwner(seed = 1) {
  pets.setRng(mulberry32(seed));
  const w = makeWorld();
  const shop = w.map.pois.find((q) => q.kind === 'coffee');
  const a = joinPlayer(w, { cash: 0 });
  teleport(w, a.p.ped, shop.x, shop.y + 40);
  let pet = null;
  for (let k = 0; k < 20 && !pet; k++) pet = pets.spawnLost(w, a.p);
  assert.ok(pet, 'a pet went missing');
  const owner = w.get(pet.pet.owner);
  pet.pet.follow = a.p.ped.id;
  // round the owner's side (from your side of them), the pet at your heel
  teleport(w, a.p.ped, owner.x + 60, owner.y);
  teleport(w, pet, owner.x + 96, owner.y);
  run(w, 0.5);
  return { w, a, pet, owner };
}
const wrap = (x) => { x %= Math.PI * 2; if (x > Math.PI) x -= Math.PI * 2; else if (x < -Math.PI) x += Math.PI * 2; return x; };

test('handed back, the pet runs to its owner, races round them and hops up at them happy - then follows them as they walk off', () => {
  const { w, a, pet, owner } = atTheOwner();
  const act = players.findInteraction(w, a.p);
  assert.ok(act && /Give .* back/.test(act.label), act && act.label);
  act.run();
  assert.equal(a.prof.cash, PET_REWARD, 'the reward');
  assert.ok(w.get(pet.id), 'it is still there');
  assert.ok(pet.pet.home && !pet.pet.follow, 'off your collar, back with them');
  assert.ok(!pets.lostPets(w).includes(pet) && !(w.happenings || []).some((e) => e.kind === 'pet' && e.pet === pet.id), 'no longer lost, off the radar');
  assert.equal(_fields(w, pet)[3] & 31, APOSE.happy, 'happy, on the wire');
  const act2 = players.findInteraction(w, a.p);
  assert.ok(!act2 || !/collar|back/.test(act2.label), 'nothing more to do with it');
  // a dash to them, then round and round them
  const ox = owner.x, oy = owner.y;
  let reached = -1, swept = 0, lastA = null, hops = 0;
  for (let t = 0; t < 10 * 20 && pet.pet.home.phase !== 'heel'; t++) {
    w.step();
    const d = Math.hypot(pet.x - owner.x, pet.y - owner.y), ang = Math.atan2(pet.y - owner.y, pet.x - owner.x);
    if (reached < 0 && d < 34) reached = w.time;
    if (pet.pet.home.phase === 'joy' && d < 60) { if (lastA !== null) swept += wrap(ang - lastA); lastA = ang; }
    if (pet.pet.home.phase === 'joy' && d < 60 && Math.hypot(pet.vx, pet.vy) < 20) hops++;
    assert.ok(Math.hypot(owner.x - ox, owner.y - oy) < 6, 'the owner stays put to greet it');
  }
  assert.ok(reached > 0, 'it ran up to them');
  assert.ok(Math.abs(swept) > Math.PI * 2, `round and round them (${(Math.abs(swept) / Math.PI / 2).toFixed(1)} laps)`);
  assert.ok(hops > 10, 'then up at them, bouncing on the spot');
  assert.equal(pet.pet.home.phase, 'heel');
  assert.equal(_fields(w, pet)[3] & 31, 0, 'calm again');
  // off they go, the pet at their heel
  assert.ok(!owner.npc.keep, 'the owner is anyone in the street again');
  let far = 0, maxGap = 0;
  for (let t = 0; t < 25 * 20; t++) {
    w.step();
    far = Math.max(far, Math.hypot(owner.x - ox, owner.y - oy));
    maxGap = Math.max(maxGap, Math.hypot(pet.x - owner.x, pet.y - owner.y));
  }
  assert.ok(far > 80, `the owner walked off (${far | 0} px)`);
  assert.ok(maxGap < 200, `the pet kept with them (${maxGap | 0} px at most)`);
  assert.ok(Math.hypot(pet.x - owner.x, pet.y - owner.y) < 80, 'at their heel');
});

test('once nobody is near, the owner is cleared away the usual way - and the pet with them', () => {
  const { w, a, pet, owner } = atTheOwner(2);
  players.findInteraction(w, a.p).run();
  run(w, 8);
  assert.equal(pet.pet.home.phase, 'heel');
  teleport(w, a.p.ped, owner.x + 6000, owner.y);
  for (let t = 0; t < 10 * 20 && (w.get(owner.id) || w.get(pet.id)); t++) w.step();
  assert.ok(!w.get(owner.id), 'the owner went');
  assert.ok(!w.get(pet.id), 'and the pet with them');
});

test('a pet whose owner is gone before it gets to them goes too, once nobody sees it', () => {
  const { w, a, pet, owner } = atTheOwner(3);
  players.findInteraction(w, a.p).run();
  w.remove(owner);
  run(w, 0.5);
  assert.ok(w.get(pet.id), 'still there while you can see it');
  teleport(w, a.p.ped, pet.x + 6000, pet.y);
  run(w, 0.5);
  assert.ok(!w.get(pet.id), 'gone once out of sight');
});
