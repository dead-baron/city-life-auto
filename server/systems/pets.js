// Lost pets: every so often a dog or a cat slips its lead somewhere near a player. Its owner is
// out looking for it a few blocks away. Find the pet, take its collar (it trots along at your heel)
// and walk it back to the owner for a reward. Pets can't be hurt and aren't witnesses.
import { K, T } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { pedStep } from '../../shared/physics.js';
import { PET_EVERY_S, PET_REWARD, PET_SAMARITAN } from '../../shared/rules.js';
import { store } from '../store.js';
import { inAnyView } from '../view.js';
import { spawnNpc, seek } from './npc.js';
import * as players from './players.js';
import * as events from './events.js';

const KINDS = [
  { art: 'dog_golden', what: 'dog', names: ['Biscuit', 'Rex', 'Goldie', 'Max'] },
  { art: 'dog_black', what: 'dog', names: ['Shadow', 'Bear', 'Midnight', 'Duke'] },
  { art: 'dog_spaniel', what: 'dog', names: ['Bella', 'Patches', 'Cooper'] },
  { art: 'dog_pup', what: 'puppy', names: ['Peanut', 'Pip', 'Waffles'] },
  { art: 'cat_black', what: 'cat', names: ['Salem', 'Inky', 'Luna'] },
  { art: 'cat_grey', what: 'cat', names: ['Smokey', 'Misty', 'Earl Grey'] },
  { art: 'cat_ginger', what: 'cat', names: ['Marmalade', 'Ginger', 'Tiger'] },
];
const MAX_LOST = 2;
const GIVE_UP_S = 420;   // nobody found it: it finds its own way home
const HEEL_PX = 34;      // a led pet keeps this far behind you
const LEASH_PX = 900;    // get this far from your pet (a car, a teleport) and it slips away again
const CATCH_UP_PX = 170; // a pet held up by a corner catches up once it's this far behind
const PET_SPEED = { dog: 120, puppy: 100, cat: 95 };

let rng = Math.random;
export function setRng(r) { rng = r; }

const walkable = (map, x, y) => { const t = map.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.WATER && t !== T.DEEP; };

function spot(world, near, rMin, rMax) {
  for (let k = 0; k < 40; k++) {
    const a = rng() * Math.PI * 2, d = rMin + rng() * (rMax - rMin);
    const x = near.x + Math.cos(a) * d, y = near.y + Math.sin(a) * d;
    if (!walkable(world.map, x, y) || !walkable(world.map, x + 12, y) || !walkable(world.map, x, y + 12)) continue;
    if ((world.map.zoneAt && near.zone !== undefined) && world.map.zoneAt(x, y) !== near.zone) continue;
    return { x, y };
  }
  return null;
}

export function spawnLost(world, p) {
  const ped = p.ped;
  if (!ped) return null;
  const k = KINDS[Math.floor(rng() * KINDS.length)];
  const name = k.names[Math.floor(rng() * k.names.length)];
  const here = { x: ped.x, y: ped.y, zone: world.map.zoneAt(ped.x, ped.y) };
  const at = spot(world, here, 450, 900);
  if (!at) return null;
  const home = spot(world, { ...at, zone: here.zone }, 650, 1100);
  if (!home) return null;
  const pet = world.spawnPed(at.x, at.y, { hp: 40, archetype: `pet:${k.art}`, name, a: rng() * 6.28, app: { bd: 1 } });
  pet.pet = { kind: k.what, art: k.art, name, follow: 0, wx: at.x, wy: at.y, until: 0, owner: 0, born: world.time };
  const owner = spawnNpc(world, 'casual', home.x, home.y, 'civ');
  owner.npc.keep = true;
  owner.npc.petOwner = pet.id;
  owner.npc.state = 'idle';
  owner.npc.home = { x: home.x, y: home.y };
  pet.pet.owner = owner.id;
  const ev = events.add(world, { kind: 'pet', x: at.x, y: at.y, until: world.time + GIVE_UP_S, pet: pet.id, text: `Lost ${k.what}: ${name}` });
  pet.pet.ev = ev.id;
  events.tellNear(world, at.x, at.y, `Lost ${k.what}! ${name} has run off - find it and walk it home to its owner.`, 'info');
  return pet;
}

function remove(world, pet) {
  const owner = world.get(pet.pet.owner);
  if (owner && owner.npc) { owner.npc.petOwner = 0; owner.npc.keep = false; owner.npc.state = 'wander'; }
  if (world.happenings) world.happenings = world.happenings.filter((e) => e.id !== pet.pet.ev);
  world.remove(pet);
}

export function lostPets(world) {
  const out = [];
  for (const e of world.entities.values()) if (e.kind === K.PED && e.pet && !e.removed) out.push(e);
  return out;
}

// Interaction on foot: take a lost pet's collar, or hand it back to its owner.
export function interaction(world, p) {
  const ped = p.ped;
  for (const pet of lostPets(world)) {
    const pp = pet.pet;
    if (pp.follow === ped.id) {
      const owner = world.get(pp.owner);
      if (owner && !owner.dead && Math.hypot(owner.x - ped.x, owner.y - ped.y) < 80) return { label: `Give ${pp.name} back to its owner (+$${PET_REWARD})`, run: () => giveBack(world, p, pet) };
      continue;
    }
    if (!pp.follow && Math.hypot(pet.x - ped.x, pet.y - ped.y) < 52) return { label: `Take ${pp.name}'s collar - walk the ${pp.kind} home`, run: () => takeCollar(world, p, pet) };
  }
  return null;
}

function takeCollar(world, p, pet) {
  pet.pet.follow = p.ped.id;
  world.notify(p, `${pet.pet.name} trots along with you. The owner is marked - walk it home.`, 'good');
  p.meDirty = true;
}

export function giveBack(world, p, pet) {
  const owner = world.get(pet.pet.owner);
  p.profile.cash += PET_REWARD;
  p.profile.samaritan += PET_SAMARITAN;
  store.touch();
  p.meDirty = true;
  world.emit(owner ? owner.x : pet.x, owner ? owner.y : pet.y, { e: 'cash', x: pet.x, y: pet.y, n: PET_REWARD });
  world.notify(p, `"${pet.pet.name}! Oh thank you!" +$${PET_REWARD}, +${PET_SAMARITAN} Samaritan.`, 'good');
  events.feed(world, { kind: 'pet', text: `${p.name} brought ${pet.pet.name} the ${pet.pet.kind} home`, x: pet.x, y: pet.y });
  remove(world, pet);
}

events.setPetTarget((world, p) => targetFor(world, p));

// Where the pet you're leading should go (the owner), for the guide arrow.
export function targetFor(world, p) {
  if (!p.ped) return null;
  for (const pet of lostPets(world)) {
    if (pet.pet.follow !== p.ped.id) continue;
    const owner = world.get(pet.pet.owner);
    if (owner) return { id: 'pet' + pet.id, k: 'petret', x: Math.round(owner.x), y: Math.round(owner.y) };
  }
  return null;
}

export function update(world, dt) {
  const now = world.time;
  // now and then a pet goes missing near someone
  if (world.tick % 40 === 17 && world.players.size) {
    world.nextPetAt ??= now + PET_EVERY_S * 0.4;
    if (now >= world.nextPetAt) {
      world.nextPetAt = now + PET_EVERY_S * (0.7 + rng() * 0.6);
      const ps = [...world.players.values()].filter((q) => q.ped && !q.ped.dead && !q.ped.hidden && !q.ped.vehId && !q.ped.sub);
      if (ps.length && lostPets(world).length < MAX_LOST) spawnLost(world, ps[Math.floor(rng() * ps.length)]);
    }
  }
  for (const pet of lostPets(world)) {
    const pp = pet.pet;
    const owner = world.get(pp.owner);
    if (!owner || owner.dead || owner.removed) { if (!inAnyView(world, pet.x, pet.y, 40)) remove(world, pet); continue; }
    if (now - pp.born > GIVE_UP_S && !pp.follow && !inAnyView(world, pet.x, pet.y, 40)) { remove(world, pet); continue; }
    const speed = PET_SPEED[pp.kind] || 100;
    let inp = { bits: 0, mx: 0, my: 0, aim: pet.a };
    if (pp.follow) {
      const lead = world.get(pp.follow);
      if (!lead || lead.dead || lead.vehId || lead.hidden || Math.hypot(lead.x - pet.x, lead.y - pet.y) > LEASH_PX) {
        pp.follow = 0; // slipped away
        if (lead && lead.player) world.notify(lead.player, `${pp.name} slipped away! Find it again.`, 'warn');
      } else {
        const dx = lead.x - pet.x, dy = lead.y - pet.y, d = Math.hypot(dx, dy);
        if (d > CATCH_UP_PX) {
          // snagged on a corner: it squeezes through and scampers up behind you
          const bx = lead.x - Math.cos(lead.a) * HEEL_PX, by = lead.y - Math.sin(lead.a) * HEEL_PX;
          const at = walkable(world.map, bx, by) ? { x: bx, y: by } : { x: lead.x, y: lead.y };
          pet.x = at.x; pet.y = at.y; pet.vx = 0; pet.vy = 0;
        } else if (d > HEEL_PX) inp = seek(pet, lead.x, lead.y, d > 120);
      }
    } else {
      // sniff about: short trots between pauses, never onto the road
      if (now >= pp.until) {
        pp.until = now + 1.5 + rng() * 3;
        const a = rng() * 6.28, r = 40 + rng() * 120;
        const tx = pet.x + Math.cos(a) * r, ty = pet.y + Math.sin(a) * r;
        if (walkable(world.map, tx, ty)) { pp.wx = tx; pp.wy = ty; } else { pp.wx = pet.x; pp.wy = pet.y; }
      }
      const dx = pp.wx - pet.x, dy = pp.wy - pet.y, d = Math.hypot(dx, dy);
      if (d > 8 && now < pp.until - 0.6) inp = seek(pet, pp.wx, pp.wy, false);
    }
    const mods = players.pedMods(world, pet);
    mods.speedMul *= speed / 100; mods.canSwim = false;
    pedStep(pet, inp, dt, world.map, mods);
    if (inp.mx || inp.my) pet.a = Math.atan2(inp.my, inp.mx);
    world.place(pet);
    // the event blip follows the pet
    const ev = world.happenings && world.happenings.find((e) => e.id === pp.ev);
    if (ev) { ev.x = pet.x; ev.y = pet.y; }
    // the owner stays put near home, calling for it
    if (owner.npc) { owner.npc.state = 'idle'; owner.vx = 0; owner.vy = 0; }
  }
}
