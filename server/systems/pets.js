// Lost pets (the owner's notes, batch 4: "a 'lost pet' poster are hung up and if you actually read the poster gives an
// approximate area where the pet was last seen, and also ... the owner's location where you can bring the lost animal
// to"). Now and then (PET_EVERY_S, at most PET_MAX_LOST at once) a dog or a cat slips out of a real home - a house, a
// cottage or a flat nobody plays in - not far from someone. Its owner stands at their door. Posters go up on the poles,
// the walls and the noticeboards by the home and along the way to where it was last seen (posterSpots): drawn on the page
// as props (client/lostposter.js). Read one (ACT at it) and you know its name, what it looks like, the area it was last
// seen in - an approximate circle on your map and radar (PET_AREA_R) - and the owner's address. It's somewhere in that
// area (a yard, a park, an alley, under a porch: never the road), sniffing about slowly. Find it and take its collar: it
// trots at your heel and the way to its home is marked (petret). Hand it back at the door for a reward that grows with
// the walk (PET_REWARD, rewardFor). Let it go (ACT with nothing else to do: letGo) - or lose it (a car, a teleport) - and
// it sniffs about near where you left it, the area moved there; the posters stay up till it's home. Nobody brings it
// home in PET_LOST_S and it finds its own way back: the posters come down. Pets can't be hurt and aren't witnesses.
// Home again (task #427): it dashes to its owner, races round them and hops up at them with its tail going
// (APOSE.happy on the wire) while they watch; then the owner heads off and it trots at their heel - both gone the usual
// way once out of everyone's sight (npc.js manageDensity). (H71) A player with a home and no pet may be offered it.
import { K, T, TILE } from '../../shared/constants.js';
import { APOSE } from '../../shared/fauna.js';
import { PED_BLOCK } from '../../shared/map.js';
import { pedStep } from '../../shared/physics.js';
import { PET_EVERY_S, PET_MAX_LOST, PET_LOST_PX, PET_AREA_R, PET_POSTERS, PET_LOST_S, PET_REWARD, PET_SAMARITAN } from '../../shared/rules.js';
import { store } from '../store.js';
import { inAnyView } from '../view.js';
import { pointGrid } from '../pointgrid.js';
import { spawnNpc, seek } from './npc.js';
import * as players from './players.js';
import * as events from './events.js';

const KINDS = [
  { art: 'dog_golden', what: 'dog', look: 'A golden retriever - big, friendly, red collar.', names: ['Biscuit', 'Rex', 'Goldie', 'Max'] },
  { art: 'dog_black', what: 'dog', look: 'A black Labrador with a blue collar. Comes to a whistle.', names: ['Shadow', 'Bear', 'Midnight', 'Duke'] },
  { art: 'dog_spaniel', what: 'dog', look: 'A brown-and-white spaniel, floppy ears, very muddy by now.', names: ['Bella', 'Patches', 'Cooper'] },
  { art: 'dog_pup', what: 'puppy', look: 'A little cream puppy with a bell on its collar. Nervous of cars.', names: ['Peanut', 'Pip', 'Waffles'] },
  { art: 'cat_black', what: 'cat', look: 'A black cat, green eyes, a silver tag. Likes to hide.', names: ['Salem', 'Inky', 'Luna'] },
  { art: 'cat_grey', what: 'cat', look: 'A grey tabby, shy - talk softly.', names: ['Smokey', 'Misty', 'Earl Grey'] },
  { art: 'cat_ginger', what: 'cat', look: 'A big fluffy ginger cat. Will follow food anywhere.', names: ['Marmalade', 'Ginger', 'Tiger'] },
];
const HOME_KINDS = new Set(['house', 'cottage', 'apartment']);   // (m.homes: the homes of the city, not a shack or a mansion)
const HOME_NEAR = [400, 2600];   // the home is this far from the player it goes missing near (px)
const POLES = new Set(['lamp', 'upole', 'sigpole', 'post', 'mapboard', 'busstop', 'fingerpost', 'roadsign']);   // (props a poster goes up on)
const POSTER_GAP = 120;  // posters at least this far apart
const POSTER_SEE = 900;  // the posters are on the page within this of you
const READ_R = 44;       // stand this close to a poster to read it
const OWNER_SEE = 700;   // a lost pet's owner, out at their door, is marked ("Lost my dog!") for people this near
const HEEL_PX = 34;      // a led pet keeps this far behind you
const LEASH_PX = 900;    // get this far from your pet (a car, a teleport) and it slips away again
const CATCH_UP_PX = 170; // a pet held up by a corner catches up once it's this far behind
const PET_SPEED = { dog: 120, puppy: 100, cat: 95 };
const SNIFF = 0.55;      // lost, it sniffs about at this share of its pace
// home again: round its owner this far out, this many times, then hopping up at them this long (at most this long getting
// to them); with them a good while and out of everyone's sight, it's gone home with them even if they're still about
const JOY_R = 26, JOY_LAPS = 1.5, HOP_S = 1.8, RUN_S = 6, HOMEWARD_S = 150;

let rng = Math.random;
export function setRng(r) { rng = r; }

// Ground a lost pet keeps to: anywhere a person walks but the road (an alley's asphalt is fine), the water or indoors
export function petGround(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), t = map.tileAt(tx, ty);
  if (PED_BLOCK[t] || t === T.WATER || t === T.DEEP || t === T.BRIDGE || t === T.FLOOR) return false;
  return t !== T.ROAD || (map.inside(tx, ty) && map.roadRank[map.idx(tx, ty)] === 1);
}
const roomy = (map, x, y) => petGround(map, x, y) && petGround(map, x + 12, y) && petGround(map, x, y + 12) && petGround(map, x - 12, y);
const tileAt = (map, x, y) => map.tileAtPx(x, y);
const byBuilding = (map, x, y) => [[TILE, 0], [-TILE, 0], [0, TILE], [0, -TILE]].some(([dx, dy]) => tileAt(map, x + dx, y + dy) === T.BUILDING);
// how good a hiding place: a yard or a park, an alley, under a porch (by a house, off the pavement) - the pavement least
function hideScore(map, x, y) {
  const t = tileAt(map, x, y);
  let s = t === T.GRASS ? 3 : t === T.ROAD ? 3 : t === T.DIRT || t === T.SAND || t === T.FIELD ? 2 : 1;
  if (t !== T.SIDEWALK && byBuilding(map, x, y)) s += 2;
  return s;
}
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];   // (y down: the screen's north is up)
const compass = (dx, dy) => COMPASS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
const howFar = (d) => (d < 450 ? 'just' : d < 1100 ? 'a short walk' : d < 2000 ? 'a fair walk' : 'a good walk');
const districtName = (map, x, y) => { const d = map.districtAt(x, y); return d ? d.name : 'town'; };

// ---- where it all goes ------------------------------------------------------------------------------------------------
// the door of a home: open ground just outside it
function doorOf(world, h) {
  const m = world.map;
  if (roomy(m, h.x, h.y) && tileAt(m, h.x, h.y) !== T.ROAD) return { x: h.x, y: h.y };
  for (let r = 12; r <= 72; r += 12) for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r;
    if (roomy(m, x, y) && tileAt(m, x, y) !== T.ROAD) return { x, y };
  }
  return null;
}
// the area it was last seen in (its middle, a walk from home on the same island, in town) and the pet's spot in it
function lostArea(world, door) {
  const m = world.map, zone = m.zoneAt(door.x, door.y);
  for (let k = 0; k < 30; k++) {
    const a = rng() * Math.PI * 2, d = PET_LOST_PX[0] + rng() * (PET_LOST_PX[1] - PET_LOST_PX[0]);
    const cx = door.x + Math.cos(a) * d, cy = door.y + Math.sin(a) * d;
    const dist = m.districtAt(cx, cy);
    if (m.zoneAt(cx, cy) !== zone || !dist || dist.tier === 'wild' || PED_BLOCK[tileAt(m, cx, cy)]) continue;
    const at = hidingPlace(world, cx, cy, PET_AREA_R * 0.7);
    if (at) return { area: { x: Math.round(cx), y: Math.round(cy), r: PET_AREA_R }, at };
  }
  return null;
}
// somewhere in r of (cx, cy) a lost pet would end up: the best of a few looks (hideScore), out of everyone's sight
function hidingPlace(world, cx, cy, r) {
  const m = world.map;
  let best = null, bs = 0;
  for (let k = 0; k < 50; k++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (!roomy(m, x, y) || inAnyView(world, x, y, 40)) continue;
    const s = hideScore(m, x, y) + rng() * 0.5;
    if (s > bs) { bs = s; best = { x, y }; }
  }
  return best;
}
// The posters: by the home first, then along the way to the area and at its near edge - each on the nearest pole or
// noticeboard (POLES) by its foot on the pavement, or a wall's face over the pavement, out of everyone's sight
function posterSpots(world, door, area) {
  const m = world.map;
  const poles = (world._posterPoles ||= m.props.filter((q) => POLES.has(q.t)));
  const grid = pointGrid(poles);
  const dx = area.x - door.x, dy = area.y - door.y, L = Math.hypot(dx, dy) || 1;
  const aims = [0, 0.33, 0.66, (L - area.r * 0.9) / L].slice(0, Math.max(1, PET_POSTERS));
  const out = [];
  const free = (x, y) => !out.some((q) => Math.hypot(q.x - x, q.y - y) < POSTER_GAP) && !inAnyView(world, x, y, 40);
  const foot = (x, y) => { const t = tileAt(m, x, y); return t !== T.ROAD && !PED_BLOCK[t] && t !== T.WATER && t !== T.DEEP; };
  for (const f of aims) {
    const ax = door.x + dx * f, ay = door.y + dy * f;
    let best = null, bd = Infinity;
    for (const q of grid.within(ax, ay, 0, 220)) {
      const d = Math.hypot(q.x - ax, q.y - ay);
      if (d < bd && foot(q.x, q.y) && free(q.x, q.y)) { bd = d; best = { x: Math.round(q.x), y: Math.round(q.y), on: q.t === 'mapboard' ? 'board' : 'pole' }; }
    }
    if (!best) {   // no pole: a wall over the pavement (its face looks down the screen: the building's to the north)
      const tx0 = Math.floor(ax / TILE), ty0 = Math.floor(ay / TILE);
      for (let r = 0; r <= 5 && !best; r++) for (let ty = ty0 - r; ty <= ty0 + r && !best; ty++) for (let tx = tx0 - r; tx <= tx0 + r; tx++) {
        if (Math.max(Math.abs(tx - tx0), Math.abs(ty - ty0)) !== r || m.tileAt(tx, ty) !== T.SIDEWALK || m.tileAt(tx, ty - 1) !== T.BUILDING) continue;
        const x = tx * TILE + TILE / 2, y = ty * TILE + 3;
        if (free(x, y)) { best = { x, y, on: 'wall' }; break; }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

// A pet goes missing from a home near this player (null if there's nowhere for it to go just now)
export function spawnLost(world, p) {
  const ped = p.ped;
  if (!ped) return null;
  const m = world.map, zone = m.zoneAt(ped.x, ped.y);
  const taken = new Set(lostPets(world).map((q) => q.pet.house.id));
  const homes = (m.homes || []).filter((h) => h && HOME_KINDS.has(h.kind) && !world.homeOwner.has(h.id) && !taken.has(h.id) && m.zoneAt(h.x, h.y) === zone
    && Math.hypot(h.x - ped.x, h.y - ped.y) >= HOME_NEAR[0] && Math.hypot(h.x - ped.x, h.y - ped.y) <= HOME_NEAR[1]);
  for (let i = homes.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [homes[i], homes[j]] = [homes[j], homes[i]]; }
  for (const h of homes.slice(0, 8)) {
    const door = doorOf(world, h);
    if (!door || inAnyView(world, door.x, door.y, 40)) continue;
    const lost = lostArea(world, door);
    if (!lost) continue;
    const posters = posterSpots(world, door, lost.area);
    if (!posters.length) continue;
    return create(world, h, door, lost, posters);
  }
  return null;
}

function create(world, h, door, lost, posters) {
  const k = KINDS[Math.floor(rng() * KINDS.length)];
  const name = k.names[Math.floor(rng() * k.names.length)];
  const { at, area } = lost;
  const pet = world.spawnPed(at.x, at.y, { hp: 40, archetype: `pet:${k.art}`, name, a: rng() * 6.28, app: { bd: 1 } });
  pet.pet = {
    kind: k.what, art: k.art, name, look: k.look, follow: 0, wx: at.x, wy: at.y, until: 0, owner: 0, born: world.time,
    house: { id: h.id, x: Math.round(door.x), y: Math.round(door.y), name: h.name || 'a house', where: districtName(world.map, door.x, door.y) },
    area, posters, read: new Set(), foundX: at.x, foundY: at.y,
  };
  ownerOut(world, pet);
  events.feed(world, { kind: 'pet', text: `"Lost ${k.what}" posters are up round ${pet.pet.house.where}: ${name}`, x: door.x, y: door.y });
  events.tellNear(world, door.x, door.y, `Someone's put up "Lost ${k.what}" posters round here - read one.`, 'info');
  return pet;
}
// its owner, out at their door
function ownerOut(world, pet) {
  const H = pet.pet.house;
  const owner = spawnNpc(world, 'casual', H.x, H.y, 'civ');
  if (!owner) return null;
  owner.npc.keep = true; owner.npc.petOwner = pet.id; owner.npc.state = 'idle'; owner.npc.home = { x: H.x, y: H.y };
  pet.pet.owner = owner.id;
  return owner;
}

function remove(world, pet) {
  const owner = world.get(pet.pet.owner);
  if (owner && owner.npc) { owner.npc.petOwner = 0; owner.npc.keep = false; owner.npc.state = 'wander'; }
  world.remove(pet);
}

export function lostPets(world) {
  const out = [];
  for (const e of world.entities.values()) if (e.kind === K.PED && e.pet && e.pet.house && !e.pet.home && !e.removed) out.push(e);   // (a dog walker's (personas.js), a police dog (k9.js): no house - not lost)
  return out;
}
// the pets back with their owners
export function homePets(world) {
  const out = [];
  for (const e of world.entities.values()) if (e.kind === K.PED && e.pet && e.pet.home && !e.removed) out.push(e);
  return out;
}
// what bringing it home pays: more the further it was from its door when you found it
export function rewardFor(pet) {
  const pp = pet.pet, d = Math.hypot(pp.foundX - pp.house.x, pp.foundY - pp.house.y);
  return Math.min(PET_REWARD.max, Math.round(PET_REWARD.base + PET_REWARD.perM * d / TILE));
}
// what a poster says (to the one reading it at x, y)
export function posterText(world, pet, x, y) {
  const pp = pet.pet, A = pp.area, H = pp.house, d = Math.hypot(A.x - x, A.y - y);
  const seen = d < A.r ? 'right round here' : `${howFar(d)} ${compass(A.x - x, A.y - y)} of here`;
  return `LOST ${pp.kind.toUpperCase()}: ${pp.name}. ${pp.look} Last seen in ${districtName(world.map, A.x, A.y)}, ${seen} - marked on your map. Found it? Please bring ${pp.name} home to ${H.name} (${H.where}). REWARD.`;
}

// Interaction on foot: adopt one offered to you, hand one back at its door, take a lost pet's collar, read a poster.
export function interaction(world, p) {
  const ped = p.ped;
  for (const pet of homePets(world)) {   // (H71: offered to you by its owner - adopt it)
    const o = pet.pet.offer;
    if (o && o.pid === p.pid && world.time <= o.until && !p.profile.pet && Math.hypot(pet.x - ped.x, pet.y - ped.y) < 70) return { label: `Adopt ${pet.pet.name} - it'll wait for you at home`, run: () => { const err = adopt(world, p, pet); if (err) world.notify(p, err, 'bad'); } };
  }
  const lost = lostPets(world);
  for (const pet of lost) {
    const pp = pet.pet;
    if (pp.follow === ped.id) {
      const owner = world.get(pp.owner);
      if (owner && !owner.dead && Math.hypot(owner.x - ped.x, owner.y - ped.y) < 80) return { label: `Give ${pp.name} back to its owner (+$${rewardFor(pet)})`, run: () => giveBack(world, p, pet) };
      continue;
    }
    if (!pp.follow && Math.hypot(pet.x - ped.x, pet.y - ped.y) < 52) return { label: `Take ${pp.name}'s collar - the tag says ${pp.house.name}`, run: () => takeCollar(world, p, pet) };
  }
  for (const pet of lost) for (const q of pet.pet.posters) {
    if (Math.hypot(q.x - ped.x, q.y - ped.y) < READ_R) return { label: `Read the "Lost ${pet.pet.kind}" poster`, run: () => readPoster(world, p, pet, q) };
  }
  return null;
}
// Nothing else to do with a lost pet at your heel: let it go (players.js findInteraction, last of all)
export function letGo(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  for (const pet of lostPets(world)) if (pet.pet.follow === ped.id) return { label: `Let ${pet.pet.name} go (stop walking it home)`, run: () => abandon(world, pet, p) };
  return null;
}

export function readPoster(world, p, pet, q) {
  pet.pet.read.add(p.pid);
  world.notify(p, posterText(world, pet, q.x, q.y), 'info');
  p.meDirty = true;
}

function takeCollar(world, p, pet) {
  const pp = pet.pet;
  pp.follow = p.ped.id; pp.foundX = pet.x; pp.foundY = pet.y;
  world.notify(p, `${pp.name} trots along with you. The tag says ${pp.house.name} (${pp.house.where}) - the way is marked.`, 'good');
  for (const q of world.players.values()) q.meDirty = true;
}

// Off your collar, wherever it is now: it sniffs about round here - the area it was seen in moves here with it
function abandon(world, pet, p) {
  const pp = pet.pet;
  pp.follow = 0; pp.until = 0;
  const a = rng() * Math.PI * 2, d = rng() * pp.area.r * 0.4;
  pp.area = { x: Math.round(pet.x + Math.cos(a) * d), y: Math.round(pet.y + Math.sin(a) * d), r: pp.area.r };
  if (p) world.notify(p, `You let ${pp.name} go. It'll sniff about round here - the posters are still up.`, 'info');
  for (const q of world.players.values()) q.meDirty = true;
}

export function giveBack(world, p, pet) {
  const owner = world.get(pet.pet.owner), pay = rewardFor(pet);
  p.profile.cash += pay;
  p.profile.samaritan += PET_SAMARITAN;
  store.touch();
  p.meDirty = true;
  world.emit(owner ? owner.x : pet.x, owner ? owner.y : pet.y, { e: 'cash', x: pet.x, y: pet.y, n: pay });
  world.notify(p, `"${pet.pet.name}! Oh thank you!" +$${pay}, +${PET_SAMARITAN} Samaritan.`, 'good');
  events.feed(world, { kind: 'pet', text: `${p.name} brought ${pet.pet.name} the ${pet.pet.kind} home`, x: pet.x, y: pet.y });
  reunite(world, pet);
  // (H71) a home of your own and no pet yet: the owner, moving somewhere that won't take pets, offers it to you
  const prof = p.profile, homed = (prof.homes || []).some((id) => world.homeOwner.get(id) === p.pid);
  if (homed && !prof.pet && !pet.removed && pet.pet.home) {
    pet.pet.offer = { pid: p.pid, until: world.time + 45 };
    world.notify(p, `"${pet.pet.name} has really taken to you... we're moving somewhere that won't take pets. Would you give ${pet.pet.name} a home?" - Act by ${pet.pet.name} to adopt.`, 'info');
  }
}

// (H71) adopt a pet you brought home, offered by its owner: yours - it goes on ahead and waits for you at home, on its bed
// (server/systems/homeinside.js: it greets you at the door). profile.pet { n, art, k } - absent on older profiles.
export function adopt(world, p, pet) {
  const pp = pet.pet, prof = p.profile;
  if (!pp.offer || pp.offer.pid !== p.pid || world.time > pp.offer.until || prof.pet) return 'Not now.';
  prof.pet = { n: pp.name, art: pp.art, k: pp.kind };
  store.touch();
  const owner = world.get(pp.owner);
  if (owner && owner.npc) { owner.npc.petHome = 0; owner.npc.keep = false; owner.npc.state = 'wander'; }
  world.remove(pet);
  world.notify(p, `${pp.name} is yours! It's gone on ahead - it'll be waiting for you at home, on its bed.`, 'good');
  p.meDirty = true;
  return null;
}

// Off the collar and back with its owner: no longer lost (the posters come down, nobody's to lead), it runs to them
function reunite(world, pet) {
  const pp = pet.pet, owner = world.get(pp.owner);
  pp.follow = 0;
  for (const q of world.players.values()) q.meDirty = true;
  if (!owner || owner.dead || owner.removed) { world.remove(pet); return; }
  pp.home = { phase: 'run', t0: world.time };
  pp.mood = APOSE.happy;
  if (owner.npc) { owner.npc.petOwner = 0; owner.npc.petHome = pet.id; owner.npc.keep = true; }
}

// Every tick, a pet home again: to its owner, round and round them, hopping up at them; then at their heel as they go.
// The owner stands and watches it till then (unless something else has them: a fight, running off).
function homeStep(world, pet, dt) {
  const pp = pet.pet, H = pp.home, now = world.time, owner = world.get(pp.owner);
  const speed = PET_SPEED[pp.kind] || 100;
  let inp = { bits: 0, mx: 0, my: 0, aim: pet.a }, fast = 1;
  if (!owner || owner.removed || owner.dead) {   // its owner's gone (out of everyone's way, or worse): so is it, once nobody sees
    pp.mood = 0;
    if (!inAnyView(world, pet.x, pet.y, 40)) { world.remove(pet); return; }
  } else {
    const dx = owner.x - pet.x, dy = owner.y - pet.y, d = Math.hypot(dx, dy);
    if (H.phase === 'run') {   // a dash to them
      if (d < JOY_R + 4 || now - H.t0 > RUN_S) { H.phase = 'joy'; H.t0 = now; H.a0 = Math.atan2(pet.y - owner.y, pet.x - owner.x); H.dir = rng() < 0.5 ? 1 : -1; }
      else { inp = seek(pet, owner.x, owner.y, true); fast = 1.3; }
    }
    if (H.phase === 'joy') {
      const t = now - H.t0, lap = (2 * Math.PI * JOY_R) / (speed * 1.25);
      if (t < JOY_LAPS * lap) {   // round and round them
        const a = H.a0 + H.dir * (2 * Math.PI * t / lap + 0.7);
        inp = seek(pet, owner.x + Math.cos(a) * JOY_R, owner.y + Math.sin(a) * JOY_R, true); fast = 1.25;
      } else if (t < JOY_LAPS * lap + HOP_S) {   // up at them, hopping, the tail going
        const fx = owner.x - dx / (d || 1) * 16, fy = owner.y - dy / (d || 1) * 16;
        if (Math.hypot(fx - pet.x, fy - pet.y) > 4) inp = seek(pet, fx, fy, false);
        pet.a = Math.atan2(dy, dx);
      } else {   // done: off they go together
        H.phase = 'heel'; H.t0 = now; pp.mood = 0;
        if (owner.npc) {
          owner.npc.keep = false; owner.npc.state = 'wander'; owner.npc.until = 0;
          let near = null, nd = Infinity;
          for (const p of world.players.values()) if (p.ped && !p.ped.dead) { const q = Math.hypot(p.ped.x - owner.x, p.ped.y - owner.y); if (q < nd) { nd = q; near = p.ped; } }
          if (near) owner.npc.awayFrom = Math.atan2(owner.y - near.y, owner.x - near.x);   // (off home: away from you)
        }
      }
    }
    if (H.phase === 'heel') {   // at their heel as they go
      if (now - H.t0 > HOMEWARD_S && !inAnyView(world, pet.x, pet.y, 40) && !inAnyView(world, owner.x, owner.y, 40)) { world.remove(pet); return; }
      if (d > CATCH_UP_PX && !inAnyView(world, pet.x, pet.y, 40)) {   // held up by a corner, out of sight: there at their heel
        const bx = owner.x - Math.cos(owner.a) * HEEL_PX, by = owner.y - Math.sin(owner.a) * HEEL_PX;
        const at = roomy(world.map, bx, by) ? { x: bx, y: by } : { x: owner.x, y: owner.y };
        pet.x = at.x; pet.y = at.y; pet.vx = 0; pet.vy = 0;
      } else if (d > HEEL_PX) { inp = seek(pet, owner.x, owner.y, d > 120); fast = d > 120 ? 1.15 : 1; }
    } else if (owner.npc && (owner.npc.state === 'idle' || owner.npc.state === 'wander')) {   // the owner stands and watches it
      owner.npc.state = 'idle'; owner.npc.until = now + 2; owner.npc.lookAt = now + 2; owner.vx = 0; owner.vy = 0;
      owner.a = Math.atan2(pet.y - owner.y, pet.x - owner.x);
    }
  }
  const mods = players.pedMods(world, pet);
  mods.speedMul *= speed / 100 * fast; mods.canSwim = false;
  pedStep(pet, inp, dt, world.map, mods);
  if (inp.mx || inp.my) pet.a = Math.atan2(inp.my, inp.mx);
  world.place(pet);
}

events.setPetTarget((world, p) => targetFor(world, p));

// What a player's page marks of the lost pets (events.forPlayer): the posters near you (k 'poster', drawn as props:
// client/lostposter.js - w what's lost, a its art), the area each one you've read about was last seen in, wherever you
// are (k 'petarea', r its radius: a circle on the map and radar - till someone has it at heel), the way home for the one
// at your heel (k 'petret': its owner at their door, e them, w what they lost - "Lost my dog!" over them), and the owners
// out at their doors near you (k 'petown').
export function targetFor(world, p) {
  if (!p.ped) return null;
  const out = [], ped = p.ped;
  for (const pet of lostPets(world)) {
    const pp = pet.pet, owner = world.get(pp.owner), mine = pp.follow === ped.id;
    for (let i = 0; i < pp.posters.length; i++) { const q = pp.posters[i]; if (Math.hypot(q.x - ped.x, q.y - ped.y) < POSTER_SEE) out.push({ id: `pp${pet.id}.${i}`, k: 'poster', x: q.x, y: q.y, w: pp.kind, a: pp.art }); }
    if (!pp.follow && pp.read.has(p.pid)) out.push({ id: 'pa' + pet.id, k: 'petarea', x: pp.area.x, y: pp.area.y, r: pp.area.r });
    const ox = owner && !owner.dead && !owner.removed ? owner : null;
    if (mine) out.push({ id: 'pet' + pet.id, k: 'petret', x: Math.round(ox ? ox.x : pp.house.x), y: Math.round(ox ? ox.y : pp.house.y), e: ox ? ox.id : 0, w: pp.kind });
    else if (ox && Math.hypot(ox.x - ped.x, ox.y - ped.y) < OWNER_SEE) out.push({ id: 'po' + pet.id, k: 'petown', x: Math.round(ox.x), y: Math.round(ox.y), e: ox.id, w: pp.kind });
  }
  return out.length ? out : null;
}

export function update(world, dt) {
  const now = world.time;
  // now and then a pet goes missing from a home near someone
  if (world.tick % 40 === 17 && world.players.size) {
    world.nextPetAt ??= now + PET_EVERY_S * 0.4;
    if (now >= world.nextPetAt) {
      world.nextPetAt = now + PET_EVERY_S * (0.7 + rng() * 0.6);
      const ps = [...world.players.values()].filter((q) => q.ped && !q.ped.dead && !q.ped.hidden && !q.ped.vehId && !q.ped.sub);
      if (ps.length && lostPets(world).length < PET_MAX_LOST) spawnLost(world, ps[Math.floor(rng() * ps.length)]);
    }
  }
  for (const pet of homePets(world)) homeStep(world, pet, dt);
  for (const pet of lostPets(world)) {
    const pp = pet.pet, H = pp.house;
    let owner = world.get(pp.owner);
    if (now - pp.born > PET_LOST_S && !pp.follow && !inAnyView(world, pet.x, pet.y, 40)) { remove(world, pet); continue; }   // (it found its own way home)
    if ((!owner || owner.dead || owner.removed) && world.tick % 20 === 3 && !inAnyView(world, H.x, H.y, 40)) owner = ownerOut(world, pet);   // (someone else from the house comes out)
    const speed = PET_SPEED[pp.kind] || 100;
    let inp = { bits: 0, mx: 0, my: 0, aim: pet.a }, pace = SNIFF;
    if (pp.follow) {
      const lead = world.get(pp.follow);
      if (!lead || lead.dead || lead.vehId || lead.hidden || Math.hypot(lead.x - pet.x, lead.y - pet.y) > LEASH_PX) {
        if (lead && lead.player) world.notify(lead.player, `${pp.name} slipped away! It'll be sniffing about round where you lost it.`, 'warn');
        abandon(world, pet, null);   // (slipped away)
      } else {
        pace = 1;
        const dx = lead.x - pet.x, dy = lead.y - pet.y, d = Math.hypot(dx, dy);
        if (d > CATCH_UP_PX) {
          // snagged on a corner: it squeezes through and scampers up behind you
          const bx = lead.x - Math.cos(lead.a) * HEEL_PX, by = lead.y - Math.sin(lead.a) * HEEL_PX;
          const at = roomy(world.map, bx, by) ? { x: bx, y: by } : { x: lead.x, y: lead.y };
          pet.x = at.x; pet.y = at.y; pet.vx = 0; pet.vy = 0;
        } else if (d > HEEL_PX) inp = seek(pet, lead.x, lead.y, d > 120);
      }
    }
    if (!pp.follow) {
      // sniff about: short slow trots between pauses, in the area it was seen in, never onto the road
      if (now >= pp.until) {
        pp.until = now + 2 + rng() * 4 + (rng() < 0.45 ? 4 + rng() * 6 : 0);   // (now and then it sits a while)
        const a = rng() * 6.28, r = 30 + rng() * 90, A = pp.area;
        const tx = pet.x + Math.cos(a) * r, ty = pet.y + Math.sin(a) * r;
        if (petGround(world.map, tx, ty) && Math.hypot(tx - A.x, ty - A.y) < A.r * 0.85) { pp.wx = tx; pp.wy = ty; } else { pp.wx = pet.x; pp.wy = pet.y; }
      }
      const d = Math.hypot(pp.wx - pet.x, pp.wy - pet.y);
      if (d > 8 && now < pp.until - 0.6) inp = seek(pet, pp.wx, pp.wy, false);
    }
    const mods = players.pedMods(world, pet);
    mods.speedMul *= speed / 100 * pace; mods.canSwim = false;
    pedStep(pet, inp, dt, world.map, mods);
    if (inp.mx || inp.my) pet.a = Math.atan2(inp.my, inp.mx);
    world.place(pet);
    // the owner waits at their door, looking out for it
    if (owner && owner.npc && !owner.removed && (owner.npc.state === 'idle' || owner.npc.state === 'wander')) {
      owner.npc.state = 'idle'; owner.vx = 0; owner.vy = 0;
      if (Math.hypot(owner.x - H.x, owner.y - H.y) > 40 && !inAnyView(world, owner.x, owner.y, 40)) { owner.x = H.x; owner.y = H.y; world.place(owner); }
    }
  }
}
