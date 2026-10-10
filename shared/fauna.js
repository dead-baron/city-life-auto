// The wild animals of the open country: who they are, where they live, how they behave, what they give.
// server/systems/wildlife.js runs them (senses, moods, groups, the hunt), server/systems/hunting.js turns
// what you bring down into meat, hides, pelts and trophies; the client draws them (client/art2/animals.js,
// birds.js) from the same kinds.
//
// Sizes: tiny (a squirrel), small (a rabbit, a fox, a duck), medium (a deer, a coyote, a cougar), large (an
// elk, a black bear), huge (a moose, a grizzly). Speeds are px/s (a person walks ~110, sprints ~220). Senses
// are ranges in px at their best (sight in daylight, straight ahead; hearing a person running; smell from
// straight downwind). Temper says what they do about you:
//   skittish  - bolts the moment it's sure (deer, rabbits, the birds)
//   wary      - stands and stares first, then moves off; runs if you push it (elk, goats, otters)
//   curious   - watches from a distance, follows a little, slips away if you come on (foxes, raccoons)
//   elusive   - a predator that wants nothing to do with you: gone as soon as it's seen (cougars, bobcats,
//               coyotes) - though now and then, when the conditions are right, a cougar stalks a lone walker
//   defensive - holds its ground: warns, bluff-charges, and attacks if you don't back off (a sow with cubs,
//               a moose, a goose with goslings)
//   aggressive- charges when you come close (grizzlies, a boar once it's hurt)
// predatory: the chance, on a night or a dusk when someone is out alone, that one of these decides a person is
// prey (rolled once per animal; the conditions are checked as it goes).
// group: herd (a band with a lead animal), family (a mother and her young: fawns, cubs, kits, chicks follow
// her), covey (quail: a cock, a hen and a string of chicks that scatter and call each other back), pair,
// solo. young: the young's kind of word, youngP: how often a group has young.
// active: day | night | dawn-dusk (crepuscular) | any. habitat: weights by habitat tag (wildlife.js habitatAt).
// loot: [item, min, max, chance?] for a clean kill (hunting.js grades it). legend: the rare pure white one.

export const SPECIES = {
  // ---- deer and their kin ----
  deer: {
    name: 'Black-tailed Deer', size: 'medium', hp: 60, walk: 45, trot: 140, run: 310,
    sense: { sight: 340, hear: 320, smell: 440 }, temper: 'skittish', group: { kind: 'herd', n: [1, 4], young: 'fawn', youngP: 0.4 },
    active: 'dawn-dusk', habitat: { redwood: 4, forest: 4, meadow: 3, farm: 1.2, scrub: 1 }, diet: 'browse',
    loot: [['venison', 3, 5], ['deerHide', 1, 1], ['antlers', 1, 1, 0.45]], legend: { name: 'the White Hart', p: 0.014 },
  },
  elk: {
    name: 'Roosevelt Elk', size: 'large', hp: 150, walk: 42, trot: 130, run: 290,
    sense: { sight: 360, hear: 330, smell: 480 }, temper: 'wary', group: { kind: 'herd', n: [3, 7], young: 'calf', youngP: 0.5 },
    active: 'dawn-dusk', habitat: { redwood: 3, meadow: 3, forest: 2, mountain: 1 }, diet: 'graze', charges: 0.25,
    loot: [['elkMeat', 5, 8], ['elkHide', 1, 1], ['elkAntlers', 1, 1, 0.4]], legend: { name: 'the Ghost Elk', p: 0.012 },
  },
  moose: {
    name: 'Moose', size: 'huge', hp: 260, walk: 40, trot: 120, run: 260,
    sense: { sight: 240, hear: 360, smell: 500 }, temper: 'defensive', group: { kind: 'family', n: [1, 1], young: 'calf', youngP: 0.4 },
    active: 'dawn-dusk', habitat: { lake: 5, marsh: 5, mountain: 1 }, diet: 'browse', warnAt: 150, charges: 0.7,
    loot: [['mooseMeat', 7, 10], ['mooseHide', 1, 1], ['mooseAntlers', 1, 1, 0.5]], legend: { name: 'the White Moose', p: 0.012 },
  },
  mtgoat: {
    name: 'Mountain Goat', size: 'medium', hp: 70, walk: 36, trot: 110, run: 230,
    sense: { sight: 420, hear: 260, smell: 300 }, temper: 'wary', group: { kind: 'herd', n: [2, 5], young: 'kid', youngP: 0.45 },
    active: 'day', habitat: { cliff: 6, mountain: 2 }, diet: 'graze', nimble: true,
    loot: [['goatMeat', 2, 4], ['goatHide', 1, 1], ['goatHorns', 1, 1, 0.5]], legend: { name: 'the Summit Ghost', p: 0.014 },
  },
  boar: {
    name: 'Wild Boar', size: 'medium', hp: 110, walk: 34, trot: 120, run: 260,
    sense: { sight: 180, hear: 300, smell: 460 }, temper: 'defensive', group: { kind: 'family', n: [1, 2], young: 'piglet', youngP: 0.55 },
    active: 'dawn-dusk', habitat: { farm: 2, forest: 1.5, scrub: 2 }, diet: 'root', warnAt: 90, charges: 0.6, hurtCharge: 0.85,
    loot: [['boarMeat', 3, 5], ['boarHide', 1, 1], ['boarTusks', 1, 1, 0.6]], legend: { name: 'the Bone Boar', p: 0.012 },
  },
  // ---- the predators ----
  blackbear: {
    name: 'Black Bear', size: 'large', hp: 200, walk: 38, trot: 130, run: 310,
    sense: { sight: 220, hear: 330, smell: 620 }, temper: 'wary', group: { kind: 'family', n: [1, 1], young: 'cub', youngP: 0.4 },
    active: 'any', habitat: { redwood: 1.6, forest: 1.6, mountain: 0.8 }, diet: 'forage', warnAt: 120, charges: 0.35, predatory: 0.03, bite: 30,
    loot: [['bearMeat', 4, 7], ['bearPelt', 1, 1], ['bearClaws', 1, 1, 0.7]], legend: { name: 'the Pale Bear', p: 0.012 },
  },
  grizzly: {
    name: 'Grizzly Bear', size: 'huge', hp: 340, walk: 40, trot: 140, run: 330,
    sense: { sight: 240, hear: 340, smell: 700 }, temper: 'aggressive', group: { kind: 'family', n: [1, 1], young: 'cub', youngP: 0.3 },
    active: 'any', habitat: { mountain: 0.9 }, diet: 'forage', warnAt: 200, charges: 0.8, predatory: 0.1, bite: 48,
    loot: [['grizzlyMeat', 6, 9], ['grizzlyPelt', 1, 1], ['bearClaws', 2, 2, 0.8]], legend: { name: 'the Old King', p: 0.01 },
  },
  cougar: {
    name: 'Mountain Lion', size: 'medium', hp: 95, walk: 50, trot: 150, run: 380, stalk: 34,
    sense: { sight: 420, hear: 300, smell: 300 }, temper: 'elusive', group: { kind: 'solo', n: [1, 1] },
    active: 'dawn-dusk', habitat: { redwood: 0.6, forest: 0.6, mountain: 1, cliff: 0.8, scrub: 0.4 }, diet: 'hunt', predatory: 0.08, bite: 34,
    loot: [['cougarMeat', 2, 3], ['cougarPelt', 1, 1], ['cougarFangs', 1, 1, 0.6]], legend: { name: 'the Moonlit Lion', p: 0.014 },
  },
  bobcat: {
    name: 'Bobcat', size: 'small', hp: 40, walk: 44, trot: 130, run: 300, stalk: 30,
    sense: { sight: 340, hear: 300, smell: 220 }, temper: 'elusive', group: { kind: 'solo', n: [1, 1] },
    active: 'dawn-dusk', habitat: { forest: 0.8, scrub: 1.4, desert: 0.9, redwood: 0.5 }, diet: 'hunt',
    loot: [['gameMeat', 1, 2], ['bobcatPelt', 1, 1]], legend: { name: 'the Ghost Lynx', p: 0.014 },
  },
  coyote: {
    name: 'Coyote', size: 'medium', hp: 50, walk: 55, trot: 150, run: 300,
    sense: { sight: 360, hear: 360, smell: 480 }, temper: 'elusive', group: { kind: 'pair', n: [1, 3] },
    active: 'night', habitat: { desert: 3, scrub: 2, farm: 1.5, meadow: 1, forest: 0.6 }, diet: 'hunt', howls: true,
    loot: [['gameMeat', 1, 2], ['coyotePelt', 1, 1]], legend: { name: 'the Moon Coyote', p: 0.014 },
  },
  redfox: {
    name: 'Red Fox', size: 'small', hp: 28, walk: 48, trot: 140, run: 290,
    sense: { sight: 300, hear: 380, smell: 400 }, temper: 'curious', group: { kind: 'family', n: [1, 1], young: 'kit', youngP: 0.3 },
    active: 'dawn-dusk', habitat: { farm: 2.5, meadow: 2, forest: 0.8, scrub: 0.8 }, diet: 'hunt', pounce: true,
    loot: [['gameMeat', 1, 1], ['redFoxPelt', 1, 1]], legend: { name: 'the Snow Fox', p: 0.014 },
  },
  greyfox: {
    name: 'Grey Fox', size: 'small', hp: 26, walk: 46, trot: 140, run: 280,
    sense: { sight: 280, hear: 360, smell: 380 }, temper: 'curious', group: { kind: 'solo', n: [1, 1] },
    active: 'night', habitat: { redwood: 1.4, forest: 1.6, scrub: 1.2, desert: 0.5 }, diet: 'forage', climbs: true,
    loot: [['gameMeat', 1, 1], ['greyFoxPelt', 1, 1]], legend: { name: 'the Silver Fox', p: 0.014 },
  },
  raccoon: {
    name: 'Raccoon', size: 'small', hp: 25, walk: 35, trot: 100, run: 160,
    sense: { sight: 200, hear: 260, smell: 360 }, temper: 'curious', group: { kind: 'family', n: [1, 2], young: 'kit', youngP: 0.35 },
    active: 'night', habitat: { water: 2, redwood: 1, forest: 1.2, farm: 0.8 }, diet: 'forage', climbs: true,
    loot: [['gameMeat', 1, 1], ['raccoonPelt', 1, 1]], legend: { name: 'the Ghost Bandit', p: 0.012 },
  },
  // ---- by the water ----
  beaver: {
    name: 'Beaver', size: 'small', hp: 40, walk: 26, trot: 60, run: 110, swim: 95,
    sense: { sight: 160, hear: 300, smell: 300 }, temper: 'skittish', group: { kind: 'family', n: [1, 2], young: 'kit', youngP: 0.4 },
    active: 'dawn-dusk', habitat: { beaver: 10 }, diet: 'gnaw', swims: 'dive', works: true,
    loot: [['gameMeat', 1, 2], ['beaverPelt', 1, 1], ['castoreum', 1, 1, 0.5]], legend: { name: 'the Silver Beaver', p: 0.016 },
  },
  otter: {
    name: 'River Otter', size: 'small', hp: 32, walk: 40, trot: 110, run: 170, swim: 190,
    sense: { sight: 240, hear: 280, smell: 340 }, temper: 'curious', group: { kind: 'family', n: [1, 3], young: 'pup', youngP: 0.4 },
    active: 'day', habitat: { river: 4, creek: 3, lake: 1.5 }, diet: 'fish', swims: 'dive', playful: true,
    loot: [['gameMeat', 1, 1], ['otterPelt', 1, 1]], legend: { name: 'the Pearl Otter', p: 0.014 },
  },
  seaotter: {
    name: 'Sea Otter', size: 'small', hp: 34, walk: 20, trot: 40, run: 60, swim: 150,
    sense: { sight: 260, hear: 260, smell: 300 }, temper: 'wary', group: { kind: 'herd', n: [2, 5], young: 'pup', youngP: 0.4 },
    active: 'day', habitat: { kelp: 10 }, diet: 'fish', swims: 'float', aquatic: true, protected: true,   // (protected: nobody buys one, and the
    loot: [] },                                                                                              //  wardens fine you for it: hunting.js)
  // ---- small game ----
  rabbit: {
    name: 'Cottontail Rabbit', size: 'small', hp: 12, walk: 30, trot: 120, run: 250,
    sense: { sight: 260, hear: 320, smell: 200 }, temper: 'skittish', group: { kind: 'pair', n: [1, 2] },
    active: 'dawn-dusk', habitat: { meadow: 3, farm: 2.5, desert: 2.5, scrub: 2, forest: 1 }, diet: 'graze', zig: true, freezes: true,
    loot: [['rabbitMeat', 1, 1], ['rabbitPelt', 1, 1]], legend: { name: 'the Moon Hare', p: 0.012 },
  },
  squirrel: {
    name: 'Grey Squirrel', size: 'tiny', hp: 8, walk: 40, trot: 120, run: 230,
    sense: { sight: 240, hear: 260, smell: 160 }, temper: 'skittish', group: { kind: 'solo', n: [1, 2] },
    active: 'day', habitat: { redwood: 2.5, forest: 3, park: 2 }, diet: 'forage', climbs: true,
    loot: [['gameMeat', 1, 1], ['squirrelPelt', 1, 1]], legend: { name: 'the White Squirrel', p: 0.01 },
  },
  // ---- the birds ----
  quail: {
    name: 'California Quail', size: 'small', hp: 8, walk: 34, trot: 110, run: 200, fly: 260, bird: true,
    sense: { sight: 240, hear: 240, smell: 120 }, temper: 'skittish', group: { kind: 'covey', n: [2, 2], young: 'chick', youngP: 0.8, brood: [4, 8] },
    active: 'day', habitat: { scrub: 3, meadow: 2, farm: 1.5, desert: 2, forest: 0.6 }, diet: 'peck', runner: true,
    loot: [['birdMeat', 1, 1], ['quailFeathers', 1, 2]], legend: { name: 'the Pearl Quail', p: 0.01 },
  },
  pheasant: {
    name: 'Ring-necked Pheasant', size: 'small', hp: 14, walk: 36, trot: 120, run: 220, fly: 300, bird: true,
    sense: { sight: 260, hear: 260, smell: 120 }, temper: 'skittish', group: { kind: 'pair', n: [1, 2] },
    active: 'day', habitat: { farm: 4, meadow: 1.5 }, diet: 'peck', flushes: true,
    loot: [['birdMeat', 1, 2], ['pheasantFeathers', 1, 2]], legend: { name: 'the Golden Pheasant', p: 0.012 },
  },
  turkey: {
    name: 'Wild Turkey', size: 'medium', hp: 30, walk: 34, trot: 110, run: 220, fly: 220, bird: true,
    sense: { sight: 360, hear: 280, smell: 120 }, temper: 'skittish', group: { kind: 'herd', n: [3, 7] },
    active: 'day', habitat: { forest: 1.4, meadow: 1.5, farm: 1 }, diet: 'peck', runner: true,
    loot: [['turkeyMeat', 2, 3], ['turkeyFeathers', 1, 3]], legend: { name: 'the White Tom', p: 0.012 },
  },
  duck: {
    name: 'Mallard', size: 'small', hp: 12, walk: 30, trot: 70, run: 120, swim: 70, fly: 320, bird: true,
    sense: { sight: 300, hear: 260, smell: 100 }, temper: 'skittish', group: { kind: 'pair', n: [2, 4], young: 'duckling', youngP: 0.3, brood: [4, 7] },
    active: 'day', habitat: { lake: 4, river: 2, pond: 4, marsh: 3 }, diet: 'dabble', swims: 'paddle',
    loot: [['birdMeat', 1, 1], ['duckFeathers', 1, 2]], legend: { name: 'the Ivory Drake', p: 0.012 },
  },
  goose: {
    name: 'Canada Goose', size: 'medium', hp: 24, walk: 32, trot: 90, run: 150, swim: 80, fly: 340, bird: true,
    sense: { sight: 340, hear: 300, smell: 100 }, temper: 'skittish', group: { kind: 'herd', n: [3, 8], young: 'gosling', youngP: 0.3, brood: [3, 5] },
    active: 'day', habitat: { lake: 3, marsh: 2, farm: 1.5, pond: 2 }, diet: 'graze', swims: 'paddle', hisses: true,
    loot: [['gooseMeat', 1, 2], ['gooseFeathers', 1, 3]], legend: { name: 'the Snow Goose', p: 0.012 },
  },
};

// The young that follow a mother (smaller, can't be hunted for a hide; hunting.js won't dress them).
export const YOUNG_SCALE = 0.55;
// What each size of animal wants hitting with for a clean kill (hunting.js grades a carcass by it):
// the weapon classes that suit it best, and the ones that spoil the hide.
export const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge'];
export const SUITS = {
  tiny: ['varmint', 'bow', 'small'], small: ['varmint', 'bow', 'small'], medium: ['rifle', 'bow'],
  large: ['rifle', 'bow'], huge: ['rifle'],
};
// A weapon's class for the hunt: small (pistols), varmint (the varmint rifle), rifle (rifles), bow, shot
// (shotguns: fine for birds, they spoil a hide), blade (knives, swords), blunt (fists, bats), blast (a rocket,
// an explosion), vehicle (a car or a train).
export function huntClass(weaponId, cause) {
  if (cause === 'vehicle' || cause === 'train' || cause === 'crash') return 'vehicle';
  if (cause === 'explosion' || weaponId === 'rocket') return 'blast';
  if (cause === 'fall' || cause === 'bleed') return null;
  if (cause === 'arrow') return 'bow';
  switch (weaponId) {
    case 'bow': return 'bow';
    case 'varmint': return 'varmint';
    case 'huntrifle': case 'rifle': case 'prifle': case 'psniper': case 'passault': return 'rifle';
    case 'shotgun': case 'pshotgun': return 'shot';
    case 'pistol': case 'revolver': case 'service': case 'spistol': case 'smg': return 'small';
    case 'knife': case 'huntknife': case 'sword': case 'katana': case 'plasma': return 'blade';
    case 'fists': case 'bat': case 'crowbar': case 'sledge': case 'baton': return 'blunt';
    default: return cause === 'gun' ? 'small' : cause === 'melee' ? 'blunt' : null;
  }
}
// Grade of a carcass from how it was brought down (1 poor, 2 good, 3 perfect). hits: [{ c: huntClass }]; the
// killing blow is the last. Birds are fine with shot; a blade finishing something already down is fine.
export function gradeOf(kind, hits) {
  const S = SPECIES[kind];
  if (!S || !hits || !hits.length) return 1;
  const last = hits[hits.length - 1].c, n = hits.length;
  const suits = S.bird ? ['shot', 'varmint', 'bow', 'small'] : SUITS[S.size] || SUITS.medium;
  if (hits.some((h) => h.c === 'vehicle' || h.c === 'blast')) return 1;   // run over, blown up: a ruined hide
  if (hits.some((h) => h.c === 'shot') && !S.bird) return n === 1 && S.size !== 'tiny' && S.size !== 'small' ? 2 : 1;
  const big = SIZE_ORDER.indexOf(S.size) >= 3;
  if (last === 'blunt') return 1;
  if (last === 'blade') return n <= 2 ? 2 : 1;                           // a knife finish: decent, not perfect
  if (suits.includes(last)) return n === 1 ? 3 : n === 2 ? 2 : 1;
  if ((last === 'rifle' || last === 'shot') && !big) return n === 1 ? 2 : 1;   // too much gun for a small one: torn
  return n <= 2 ? 2 : 1;                                                // too little gun: a few holes in it
}
export const GRADE_NAME = ['', 'Poor', '', 'Perfect'];

// Habitat tags (wildlife.js habitatAt) and what they mean: redwood (the old growth in Highland Woods), forest,
// meadow (open wild grass), scrub, desert, mountain (Granite Peaks), cliff (rock faces in the wilds), farm
// (fields and pastures), water (any fresh water near), river / creek / lake / pond / marsh, kelp (the kelp
// beds off the rocky coasts), beaver (a beaver pond: map.beaverPonds), park.
export const HABITATS = ['redwood', 'forest', 'meadow', 'scrub', 'desert', 'mountain', 'cliff', 'farm', 'water', 'river', 'creek', 'lake', 'pond', 'marsh', 'kelp', 'beaver', 'park'];

// What the client draws an animal doing (the snapshot's extra byte, bits 0-4; bit 7: in the water). 0: work it out
// from the speed (stand / walk / trot / run). happy: a lost pet back with its owner (server/systems/pets.js).
export const APOSE = {
  auto: 0, graze: 1, alert: 2, stalk: 3, charge: 4, rear: 5, swim: 6, gnaw: 7, rest: 8, drink: 9, call: 10, attack: 11,
  fly: 12, climb: 13, float: 14, dive: 15, peck: 16, sit: 17, warn: 18, eat: 19, flinch: 20, happy: 21,
};

// What raw meat becomes over a campfire (hunting.js), one for one - see shared/items.js for what each gives (the
// big game's cooked meals are hearty: economy.js)
export const COOKS = {
  venison: 'venisonSteak', rabbitMeat: 'rabbitRoast', elkMeat: 'elkSteak', mooseMeat: 'mooseRoast', boarMeat: 'boarChops',
  bearMeat: 'bearStew', grizzlyMeat: 'bearStew', cougarMeat: 'gameSteak', goatMeat: 'goatStew', gameMeat: 'gameSteak',
  birdMeat: 'roastBird', turkeyMeat: 'roastTurkey', gooseMeat: 'roastGoose',
};
