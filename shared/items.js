import { REVIVE_KIT_PRICE, FLASHLIGHT_PRICE, FORAGE_FENCE_GHOSTGLASS, LIGHT_PRICES, FELL_TOOL_PRICES } from './rules.js';
import { SPECIES } from './fauna.js';
// Weapons, items, crates, loot bags and shop catalogs (GDD §8, §9, §11, §14A).

export const WEAPONS = {
  fists:    { i: 0,  name: 'Fists',            type: 'melee', dmg: 10, range: 28, arc: 1.4, cd: 0.42, push: 95 },
  bat:      { i: 1,  name: 'Baseball Bat',     type: 'melee', dmg: 22, range: 36, arc: 1.5, cd: 0.6 },
  knife:    { i: 2,  name: 'Knife',            type: 'melee', dmg: 26, range: 26, arc: 1.1, cd: 0.4, bleed: true, quiet: true, backstab: true, blade: 0.35 },
  crowbar:  { i: 3,  name: 'Crowbar',          type: 'melee', dmg: 24, range: 32, arc: 1.3, cd: 0.55 },
  sledge:   { i: 4,  name: 'Sledgehammer',     type: 'melee', dmg: 42, range: 36, arc: 1.4, cd: 1.0, knock: true },
  baton:    { i: 5,  name: 'Nightstick Baton', type: 'melee', dmg: 14, range: 32, arc: 1.3, cd: 0.5, stunChance: 0.35, nonLethal: true },
  taser:    { i: 6,  name: 'Taser Stun Gun',   type: 'taser', dmg: 2,  range: 170, cd: 1.6, stun: 2.5, nonLethal: true },
  pistol:   { i: 7,  name: 'Pistol',           type: 'gun', dmg: 18, range: 440, spread: 0.05, cd: 0.28, mag: 12 },
  revolver: { i: 8,  name: 'Revolver',         type: 'gun', dmg: 34, range: 460, spread: 0.03, cd: 0.55, mag: 6 },
  shotgun:  { i: 9,  name: 'Pump Shotgun',     type: 'gun', dmg: 10, range: 280, spread: 0.22, cd: 0.9, mag: 6, pellets: 6 },
  rifle:    { i: 10, name: 'Semi-Auto Rifle',  type: 'gun', dmg: 28, range: 680, spread: 0.02, cd: 0.3, mag: 20 },
  smg:      { i: 11, name: 'Micro SMG',        type: 'gun', dmg: 11, range: 380, spread: 0.1, cd: 0.085, mag: 30, illegal: true },
  rocket:   { i: 12, name: 'Bazooka',          type: 'rocket', dmg: 130, radius: 110, range: 720, cd: 1.6, mag: 1, illegal: true },
  rod:      { i: 13, name: 'Fishing Pole',     type: 'tool' },
  service:  { i: 14, name: 'Police Service Pistol', type: 'gun', dmg: 20, range: 470, spread: 0.04, cd: 0.26, mag: 15, police: true },
  prifle:   { i: 15, name: 'Police Patrol Rifle',     type: 'gun', dmg: 28, range: 700, spread: 0.02, cd: 0.32, mag: 20, police: true },
  psniper:  { i: 16, name: 'Police Marksman Rifle',   type: 'gun', dmg: 95, range: 1050, spread: 0.004, cd: 1.3, mag: 5, police: true },
  passault: { i: 17, name: 'Police Semi-Auto Assault Rifle', type: 'gun', dmg: 19, range: 600, spread: 0.05, cd: 0.13, mag: 30, police: true },
  spistol:  { i: 19, name: 'Silenced Pistol',        type: 'gun', dmg: 22, range: 380, spread: 0.04, cd: 0.42, mag: 10, silenced: true, illegal: true },
  pshotgun: { i: 18, name: 'Police Shotgun',          type: 'gun', dmg: 11, range: 300, spread: 0.2, cd: 0.85, mag: 7, pellets: 7, police: true },
  pepper:   { i: 20, name: 'Pepper Spray',    type: 'spray', dmg: 1, range: 95, arc: 0.95, cd: 0.9, stun: 3, mag: 6, nonLethal: true },
  spikes:   { i: 21, name: 'Spike Strip',     type: 'deploy', cd: 2, police: true },
  huntrifle: { i: 22, name: 'Hunting Rifle',  type: 'gun', dmg: 75, range: 950, spread: 0.005, cd: 1.25, mag: 5, hunting: true, wild: 2.1 },   // bolt-action, scoped: one clean shot drops a deer
  // the rest of the hunter's kit (server/systems/hunting.js): the knife that skins a hide whole, a bow that kills
  // without a sound (an arrow in flight: combat.js), and a light rifle for small game and birds
  huntknife: { i: 23, name: 'Hunting Knife',  type: 'melee', dmg: 30, range: 27, arc: 1.1, cd: 0.42, bleed: true, quiet: true, backstab: true, skins: true, blade: 0.35 },
  bow:      { i: 24, name: 'Hunting Bow',     type: 'bow', dmg: 62, range: 560, speed: 860, spread: 0.01, cd: 0.3, mag: 1, reload: 0.75, quiet: true, hunting: true, wild: 1.5, ammoName: 'arrows', starter: 12 },
  varmint:  { i: 25, name: 'Varmint Rifle',   type: 'gun', dmg: 30, range: 820, spread: 0.006, cd: 0.6, mag: 10, hunting: true },
  // blades (combat.js, reactions.js): a wide slashing arc, and they bleed. blade: the chance a killing blow is a
  // finisher - a stab or a slash that drops them where they stand - and blades bring a variety of deaths (sinking
  // to the knees, spun round, slumping back). The plasma blade, sold only by a rare wanderer (wanderer.js), cuts
  // through anything in one stroke, sears the wound shut, turns bullets aside now and then (deflect), and what it
  // kills falls in two halves.
  sword:    { i: 26, name: 'Sword',           type: 'melee', dmg: 40, range: 36, arc: 1.7, cd: 0.6, bleed: true, blade: 0.5 },
  katana:   { i: 27, name: 'Katana',          type: 'melee', dmg: 46, range: 38, arc: 1.6, cd: 0.46, bleed: true, quiet: true, blade: 0.6 },
  plasma:   { i: 28, name: 'Plasma Blade',    type: 'melee', dmg: 160, range: 42, arc: 1.9, cd: 0.36, plasma: true, blade: 1, deflect: 0.35 },
  // ---- lights to carry (task #359): the heavy flashlight - a strong beam (shared/lights.js) and a solid club with a
  // chance to stun. (Index 31, the top of the wire's five bits: net.js extra.)
  heavyflash: { i: 31, name: 'Heavy Flashlight', type: 'melee', dmg: 21, range: 32, arc: 1.3, cd: 0.55, stunChance: 0.3, light: true },
  // ---- end lights to carry ----
};
export const WEAPON_BY_INDEX = [];
for (const [id, w] of Object.entries(WEAPONS)) { w.id = id; WEAPON_BY_INDEX[w.i] = w; }

export const ITEMS = {
  medkit:  { name: 'Medical Kit',   heal: 60, stopBleed: true, sell: 30 },
  revivekit: { name: 'Revive Kit', tool: true, sell: 20 },   // defib paddles: revive a downed player to full health (never used up; not on yourself)
  flashlight: { name: 'Flashlight', tool: true, light: true, sell: 10 }, // switched on and off (never used up); no hand slot: you keep your weapon
  bandage: { name: 'Field Bandage', heal: 15, stopBleed: true, sell: 8 },
  coffee:  { name: 'Hot Coffee',    stamina: true, buff: 'coffee', sell: 0 },
  energy:  { name: 'Energy Drink',  stamina: true, buff: 'energy', sell: 0 },
  cocktail: { name: 'Neon Cocktail', stamina: true, buff: 'energy', sell: 0 },
  // bait: multiplies the odds of a fish (one bait is used per catch)
  lure:    { name: 'Shiny Lure',    bait: { salmon: 1.6, tuna: 1.8 }, sell: 5 },
  worms:   { name: 'Nightcrawler Worms', bait: { bass: 1.8 }, sell: 1 },
  shrimp:  { name: 'Live Shrimp',   bait: { salmon: 2.2 }, sell: 2 },
  squid:   { name: 'Whole Squid',   bait: { tuna: 3 }, sell: 4 },
  glowlure: { name: 'Glow Lure',    bait: { catfish: 2.5 }, night: true, sell: 4 },
  bass:    { name: 'Common Green Bass', fish: 1, sell: 35 },
  catfish: { name: 'Night Catfish',     fish: 2, sell: 70 },
  salmon:  { name: 'Rare Silver Salmon', fish: 3, sell: 120 },
  tuna:    { name: 'Legendary Bluefin Tuna', fish: 4, sell: 480 },
  grouper: { name: 'Giant Grouper',     fish: 3, deep: true, sell: 150 },
  swordfish: { name: 'Swordfish',       fish: 4, deep: true, sell: 260 },
  marlin:  { name: 'Blue Marlin',       fish: 5, deep: true, sell: 420 },
  purse:   { name: 'Snatched Purse',    loot: true, sell: 180 },
  bonds:   { name: 'Bearer Bonds',      loot: true, sell: 140 },
  jewelry: { name: 'Diamond Earrings',  loot: true, sell: 220 },
  scrap:   { name: 'Component Scrap',   loot: true, sell: 30 },
  wallet:  { name: 'Lost Wallet',       loot: true, sell: 60 },
  // fruit picked at the orchard and the vineyard: eat it for a little health (it doesn't stop bleeding), or sell it
  apple:   { name: 'Crisp Apple',       food: true, heal: 6, sell: 3 },
  orange:  { name: 'Sweet Orange',      food: true, heal: 6, sell: 4 },
  grapes:  { name: 'Bunch of Grapes',   food: true, heal: 8, sell: 6 },
  // food and drink from the new places' counters (the winery, the stands, the snack carts, the market)
  hotdog:  { name: 'Hot Dog',           food: true, heal: 15, sell: 0 },
  bread:   { name: 'Fresh Bread',       food: true, heal: 12, sell: 0 },
  honey:   { name: 'Lavender Honey',    food: true, heal: 10, sell: 8 },
  lavender: { name: 'Lavender Bunch',   sell: 4 },
  nugget:  { name: 'Gold Nugget',       loot: true, sell: 90 },   // (chipped out at the Old Granite Mine)
  quartz:  { name: 'Quartz Crystal',    loot: true, sell: 12 },
  doubloon: { name: 'Old Doubloon',     loot: true, sell: 70 },   // (found in the wreck on Wreck Island)
  // found wild (shared/foraging.js): mushrooms on the redwood floor, the tidepools' rare golden stars
  goldTrumpet: { name: 'Golden Trumpets', food: true, heal: 8, sell: 12 },
  bunCap:  { name: 'Bun Caps',          food: true, heal: 8, sell: 10 },
  shelfOyster: { name: 'Shelf Oysters', food: true, heal: 6, sell: 8 },
  redcap:  { name: 'Redcap Toadstool',  loot: true, sell: 2 },      // (pretty and poisonous: nobody eats one)
  ghostglass: { name: 'Ghostglass Caps', loot: true, illegal: true, sell: 0 },   // the glowing hallucinogen: only the black market buys them, and the police take them
  goldStar: { name: 'Golden Star',      loot: true, sell: 150 },    // a rare sea star that glows, from the tidepools
  // hunting (server/systems/hunting.js, shared/fauna.js): what a field-dressed animal gives - meat, a hide or a pelt
  // (graded: see GRADED below), the parts the trappers pay for - and the meat cooked over a fire. Cooked game is
  // hearty: it heals and builds you up (a while of more health: HEARTY_HP, HEARTY_S in rules.js).
  venison: { name: 'Raw Venison',       game: true, sell: 9 },
  elkMeat: { name: 'Raw Elk',           game: true, sell: 12 },
  mooseMeat: { name: 'Raw Moose',       game: true, sell: 14 },
  boarMeat: { name: 'Raw Boar',         game: true, sell: 10 },
  bearMeat: { name: 'Raw Bear Meat',    game: true, sell: 12 },
  grizzlyMeat: { name: 'Raw Grizzly Meat', game: true, sell: 14 },
  cougarMeat: { name: 'Raw Lion Meat',  game: true, sell: 8 },
  goatMeat: { name: 'Raw Goat',         game: true, sell: 9 },
  gameMeat: { name: 'Raw Game Meat',    game: true, sell: 5 },
  rabbitMeat: { name: 'Raw Rabbit',     game: true, sell: 4 },
  birdMeat: { name: 'Raw Bird',         game: true, sell: 4 },
  turkeyMeat: { name: 'Raw Turkey',     game: true, sell: 8 },
  gooseMeat: { name: 'Raw Goose',       game: true, sell: 7 },
  venisonSteak: { name: 'Venison Steak', food: true, heal: 35, hearty: true, sell: 16 },
  elkSteak: { name: 'Elk Steak',        food: true, heal: 40, hearty: true, sell: 20 },
  mooseRoast: { name: 'Moose Roast',    food: true, heal: 45, hearty: true, sell: 24 },
  boarChops: { name: 'Boar Chops',      food: true, heal: 35, hearty: true, sell: 18 },
  bearStew: { name: 'Bear Stew',        food: true, heal: 45, hearty: true, sell: 22 },
  goatStew: { name: 'Goat Stew',        food: true, heal: 35, hearty: true, sell: 16 },
  gameSteak: { name: 'Game Steak',      food: true, heal: 25, sell: 10 },
  rabbitRoast: { name: 'Roast Rabbit',  food: true, heal: 18, sell: 8 },
  roastBird: { name: 'Roast Bird',      food: true, heal: 18, sell: 8 },
  roastTurkey: { name: 'Roast Turkey',  food: true, heal: 30, hearty: true, sell: 14 },
  roastGoose: { name: 'Roast Goose',    food: true, heal: 28, hearty: true, sell: 13 },
  deerHide: { name: 'Deer Hide',        game: true, pelt: true, sell: 30 },
  elkHide: { name: 'Elk Hide',          game: true, pelt: true, sell: 45 },
  mooseHide: { name: 'Moose Hide',      game: true, pelt: true, sell: 55 },
  goatHide: { name: 'Mountain Goat Hide', game: true, pelt: true, sell: 34 },
  boarHide: { name: 'Boar Hide',        game: true, pelt: true, sell: 28 },
  bearPelt: { name: 'Black Bear Pelt',  game: true, pelt: true, sell: 85 },
  grizzlyPelt: { name: 'Grizzly Pelt',  game: true, pelt: true, sell: 150 },
  cougarPelt: { name: 'Mountain Lion Pelt', game: true, pelt: true, sell: 120 },
  bobcatPelt: { name: 'Bobcat Pelt',    game: true, pelt: true, sell: 60 },
  coyotePelt: { name: 'Coyote Pelt',    game: true, pelt: true, sell: 24 },
  redFoxPelt: { name: 'Red Fox Pelt',   game: true, pelt: true, sell: 55 },
  greyFoxPelt: { name: 'Grey Fox Pelt', game: true, pelt: true, sell: 50 },
  raccoonPelt: { name: 'Raccoon Pelt',  game: true, pelt: true, sell: 14 },
  beaverPelt: { name: 'Beaver Pelt',    game: true, pelt: true, sell: 60 },
  otterPelt: { name: 'River Otter Pelt', game: true, pelt: true, sell: 75 },
  rabbitPelt: { name: 'Rabbit Pelt',    game: true, pelt: true, sell: 10 },
  squirrelPelt: { name: 'Squirrel Pelt', game: true, pelt: true, sell: 6 },
  antlers: { name: 'Deer Antlers',      game: true, sell: 45 },
  elkAntlers: { name: 'Elk Antlers',    game: true, sell: 70 },
  mooseAntlers: { name: 'Moose Antlers', game: true, sell: 90 },
  goatHorns: { name: 'Mountain Goat Horns', game: true, sell: 40 },
  boarTusks: { name: 'Boar Tusks',      game: true, sell: 35 },
  bearClaws: { name: 'Bear Claws',      game: true, sell: 40 },
  cougarFangs: { name: 'Lion Fangs',    game: true, sell: 50 },
  castoreum: { name: 'Castoreum',       game: true, sell: 30 },   // (beaver musk: the perfumers pay for it)
  quailFeathers: { name: 'Quail Plumes', game: true, sell: 3 },
  pheasantFeathers: { name: 'Pheasant Tail Feathers', game: true, sell: 6 },
  turkeyFeathers: { name: 'Turkey Feathers', game: true, sell: 5 },
  duckFeathers: { name: 'Duck Feathers', game: true, sell: 3 },
  gooseFeathers: { name: 'Goose Down',  game: true, sell: 4 },
  // the hunter's gear: the ghillie cloak (in the bag, it's worn: the animals see you far less - wildlife.js), cover
  // scent (dab it on and no animal smells you for a few minutes, whichever way the wind blows)
  camoCloak: { name: 'Ghillie Camo Cloak', tool: true, camo: true, sell: 150 },
  coverScent: { name: 'Cover Scent', buff: 'scent', sell: 4 },
  // made from hides and pelts at a trapper's cabin or the lodge's work bench (CRAFTS): clothing and furs the city's
  // clothing shops pay best for
  leatherGloves: { name: 'Leather Gloves', crafted: true, sell: 70 },
  moccasins: { name: 'Moccasins', crafted: true, sell: 95 },
  furHat: { name: 'Fur Trapper Hat', crafted: true, sell: 130 },
  buckskinJacket: { name: 'Buckskin Jacket', crafted: true, sell: 240 },
  bearCoat: { name: 'Bearskin Coat', crafted: true, sell: 420 },
  bearRug: { name: 'Grizzly Rug', crafted: true, sell: 560 },
  lemonade: { name: 'Lemonade',         stamina: true, buff: 'coffee', sell: 0 },
  cider:   { name: 'Apple Cider',       stamina: true, buff: 'coffee', sell: 0 },
  // the Rusty Spur's bar (task #366)
  beer:    { name: 'Cold Beer',         buff: 'wine', sell: 0 },
  whiskey: { name: 'Shot of Rye',       stamina: true, buff: 'energy', sell: 0 },
  redwine: { name: 'Willow River Red',  buff: 'wine', sell: 12 },   // a glass or two: you heal faster for a couple of minutes
  whitewine: { name: 'Willow River White', buff: 'wine', sell: 12 },
};

// Hides and pelts come in grades (shared/fauna.js gradeOf: how cleanly it was taken, and skinned with a hunting
// knife or not): the plain id is a good one; id_1 a poor one (torn, holed), id_3 a perfect one. The rare pure white
// animals give a legendary pelt of their own (legend_<kind>), worth a great deal to the right buyer.
export const GRADED = Object.keys(ITEMS).filter((id) => ITEMS[id].pelt);
for (const id of GRADED) {
  const b = ITEMS[id];
  ITEMS[id + '_1'] = { name: 'Poor ' + b.name, game: true, pelt: true, grade: 1, base: id, sell: Math.max(1, Math.round(b.sell * 0.45)) };
  ITEMS[id + '_3'] = { name: 'Perfect ' + b.name, game: true, pelt: true, grade: 3, base: id, sell: Math.round(b.sell * 1.75) };
}
for (const [kind, S] of Object.entries(SPECIES)) {
  if (!S.legend) continue;
  const big = { tiny: 220, small: 380, medium: 650, large: 950, huge: 1300 }[S.size] || 500;
  ITEMS['legend_' + kind] = { name: `Pelt of ${S.legend.name.replace(/^the /, 'the ')}`, game: true, pelt: true, legendary: kind, sell: big };
}
// the pelt / hide item of a species (the loot entry that is a pelt), or null
export const peltOf = (kind) => { const S = SPECIES[kind]; const e = S && S.loot.find(([id]) => ITEMS[id] && ITEMS[id].pelt); return e ? e[0] : null; };
// an item id with its grade (2: the plain id)
export const graded = (id, g) => (ITEMS[id] && ITEMS[id].pelt && g !== 2 && ITEMS[id + '_' + g] ? id + '_' + g : id);

// What the trapper's cabins and the lodge's work bench make (economy.js): needs [[material, n]], a material an item
// id - any grade of a hide or pelt counts, the poorest used first - or a group (MATERIALS); gives the item, or ammo
// [weapon, n] (arrows fletched with feathers). The legendary pelts are too good to cut up.
export const MATERIALS = {
  feathers: ['quailFeathers', 'pheasantFeathers', 'turkeyFeathers', 'duckFeathers', 'gooseFeathers'],
  furs: ['raccoonPelt', 'redFoxPelt', 'greyFoxPelt', 'beaverPelt', 'otterPelt', 'coyotePelt', 'bobcatPelt'],
  heavyHide: ['elkHide', 'mooseHide'],
};
export const MATERIAL_NAME = { feathers: 'feathers', furs: 'furs (fox, raccoon, beaver, otter, coyote, bobcat)', heavyHide: 'elk or moose hide' };
export const CRAFTS = [
  { id: 'arrows', name: 'Fletch 8 arrows', needs: [['feathers', 2]], ammo: ['bow', 8] },
  { id: 'leatherGloves', needs: [['deerHide', 1]] },
  { id: 'moccasins', needs: [['heavyHide', 1]] },
  { id: 'furHat', needs: [['furs', 2]] },
  { id: 'buckskinJacket', needs: [['deerHide', 3]] },
  { id: 'camoCloak', needs: [['deerHide', 2], ['rabbitPelt', 2]] },
  { id: 'bearCoat', needs: [['bearPelt', 1], ['deerHide', 1]] },
  { id: 'bearRug', needs: [['grizzlyPelt', 1]] },
];
// the items that count as a material, poorest first
export function materialIds(mat) {
  const out = [];
  for (const b of MATERIALS[mat] || [mat]) for (const id of ITEMS[b] && ITEMS[b].pelt ? [b + '_1', b, b + '_3'] : [b]) if (ITEMS[id]) out.push(id);
  return out;
}
export const CRAFTED = Object.keys(ITEMS).filter((id) => ITEMS[id].crafted);

// What kind of thing an item is (the bag's sections and the dev give menu).
export const ITEM_CATS = [
  { id: 'tools', name: 'Tools & equipment' }, { id: 'medical', name: 'Medical' }, { id: 'drinks', name: 'Drinks' },
  { id: 'bait', name: 'Fishing bait' }, { id: 'fish', name: 'Fish' }, { id: 'food', name: 'Food' }, { id: 'game', name: 'Game & hides' },
  { id: 'crafted', name: 'Crafted goods' }, { id: 'loot', name: 'Loot & valuables' },
];
// ---- Lights to carry (task #359) and felling trees (task #358): their items ---------------------------------------
// The lights (shared/lights.js): switched on and off like the flashlight, run on batteries (one set goes in when the
// last runs flat); flares and glow sticks are lit once and burn out. The cutting tools (shared/felling.js): in the bag,
// the best one you carry does the cutting (hold the action button facing a tree); the chainsaw runs on its fuel cans.
Object.assign(ITEMS, {
  headlamp:  { name: 'Headlamp', tool: true, light: true, sell: 14 },
  hardhat:   { name: 'Hard Hat with Lamp', tool: true, light: true, sell: 22 },
  lantern:   { name: 'Lantern', tool: true, light: true, sell: 16 },
  flare:     { name: 'Road Flare', light: true, burn: true, gear: true, sell: 3 },
  glowstick: { name: 'Glow Stick', light: true, burn: true, gear: true, sell: 1 },
  batteries: { name: 'Batteries', gear: true, sell: 2 },
  hatchet:   { name: 'Hatchet', tool: true, fell: true, sell: 12 },
  axe:       { name: 'Axe', tool: true, fell: true, sell: 36 },
  fellaxe:   { name: 'Felling Axe', tool: true, fell: true, sell: 80 },
  chainsaw:  { name: 'Chainsaw', tool: true, fell: true, sell: 200 },
  sawfuel:   { name: 'Chainsaw Fuel', gear: true, sell: 4 },
});
const LIGHT_KIT = [
  { kind: 'item', id: 'headlamp', price: LIGHT_PRICES.headlamp, qty: 1 }, { kind: 'item', id: 'lantern', price: LIGHT_PRICES.lantern, qty: 1 },
  { kind: 'item', id: 'batteries', price: LIGHT_PRICES.batteries, qty: 2 }, { kind: 'item', id: 'glowstick', price: LIGHT_PRICES.glowstick, qty: 3 },
];
const FELL_KIT = [
  { kind: 'item', id: 'hatchet', price: FELL_TOOL_PRICES.hatchet, qty: 1 }, { kind: 'item', id: 'axe', price: FELL_TOOL_PRICES.axe, qty: 1 },
  { kind: 'item', id: 'fellaxe', price: FELL_TOOL_PRICES.fellaxe, qty: 1 }, { kind: 'item', id: 'chainsaw', price: FELL_TOOL_PRICES.chainsaw, qty: 1 },
  { kind: 'item', id: 'sawfuel', price: FELL_TOOL_PRICES.sawfuel, qty: 1 },
];
// ---- end lights and felling items ----
export function itemCat(id) {
  const it = ITEMS[id];
  if (!it) return null;
  return it.tool || it.gear ? 'tools' : it.food ? 'food' : it.heal ? 'medical' : it.buff || it.stamina ? 'drinks' : it.bait ? 'bait' : it.fish ? 'fish' : it.game ? 'game' : it.crafted ? 'crafted' : 'loot';
}

// GDD §8 crate rarity tiers
export const CRATE_TIERS = [
  null,
  { tier: 1, name: 'Standard Box (Wood)',     min: 150,  max: 320,  contraband: false },
  { tier: 2, name: 'Industrial Barrel (Steel)', min: 420, max: 850, contraband: false },
  { tier: 3, name: 'Secure Vault (Iron)',     min: 1600, max: 3200, contraband: true },
  { tier: 4, name: 'Legendary Case (Carbon-Gold)', min: 5000, max: 9500, contraband: true },
];

// GDD §9 loot bag tiers by total value
export function bagTier(value) {
  if (value < 300) return 1;
  if (value < 1500) return 2;
  if (value < 6000) return 3;
  return 4;
}
export const BAG_NAMES = [null, 'Canvas Duffel', 'Tactical Backpack', 'Security Case', 'Gold Lockbox'];

// The backpack you drop when you die (cargo.dropEverything): everything you carried but the cash, which falls
// beside it as a pile of notes. Its look goes by what the gear in it is worth, from a plain canvas pack to a
// glowing gold legendary one (col: the rarity's colour on the radar and the label). On the wire a pack's
// tier is 4 + its rarity (5-9: client/art2/game/actors.js bagModel).
export const PACK_TIERS = [
  null,
  { name: 'Backpack', rarity: 'Common', min: 0, col: '#cfcfcf' },
  { name: 'Trail Pack', rarity: 'Uncommon', min: 200, col: '#62d46a' },
  { name: 'Tactical Pack', rarity: 'Rare', min: 800, col: '#52a8ff' },
  { name: 'Elite Pack', rarity: 'Epic', min: 2500, col: '#bb78ff' },
  { name: 'Legendary Pack', rarity: 'Legendary', min: 8000, col: '#ffb83d' },
];
export function packTier(value) {
  let t = 1;
  for (let i = 2; i < PACK_TIERS.length; i++) if (value >= PACK_TIERS[i].min) t = i;
  return t;
}
export const PACK_WIRE = 4;   // a pack's tier on the wire: PACK_WIRE + its rarity

// What the hunting buyers take: every game item (meat, hides and pelts in every grade, the legends, the parts) and
// the cooked game; payFor: what they pay - the usual price times k
function GAME_GOODS() { return Object.keys(ITEMS).filter((id) => ITEMS[id].game || (ITEMS[id].food && COOKED.has(id))); }
const COOKED = new Set(['venisonSteak', 'elkSteak', 'mooseRoast', 'boarChops', 'bearStew', 'goatStew', 'gameSteak', 'rabbitRoast', 'roastBird', 'roastTurkey', 'roastGoose']);
const COOKED_OR_RAW = (id) => COOKED.has(id) || (ITEMS[id].game && /Meat$|^venison$/.test(id));
function payFor(ids, k) { const o = {}; for (const id of ids) o[id] = Math.round(ITEMS[id].sell * k); return o; }

// Shop catalogs: buy = [{kind:'weapon'|'ammo'|'item'|'vehicle'|'service', id, price, qty}], sells = item ids accepted.
export const SHOPS = {
  gunshop: { title: 'Iron Sights Arms', buy: [
    { kind: 'weapon', id: 'pistol', price: 450 }, { kind: 'weapon', id: 'revolver', price: 700 },
    { kind: 'weapon', id: 'shotgun', price: 950 }, { kind: 'weapon', id: 'rifle', price: 1600 },
    { kind: 'ammo', id: 'pistol', price: 30, qty: 12 }, { kind: 'ammo', id: 'revolver', price: 30, qty: 6 },
    { kind: 'ammo', id: 'shotgun', price: 40, qty: 6 }, { kind: 'ammo', id: 'rifle', price: 60, qty: 20 },
    { kind: 'weapon', id: 'pepper', price: 80 }, { kind: 'ammo', id: 'pepper', price: 15, qty: 6 },
  ] },
  sports: { title: 'Home Run Sports', buy: [
    { kind: 'weapon', id: 'bat', price: 120 }, { kind: 'weapon', id: 'rod', price: 60 },
    { kind: 'weapon', id: 'pepper', price: 70 }, { kind: 'ammo', id: 'pepper', price: 15, qty: 6 },
    { kind: 'item', id: 'lure', price: 20, qty: 3 },
  ] },
  hardware: { title: 'Nail & Gear Hardware', buy: [
    { kind: 'weapon', id: 'knife', price: 90 }, { kind: 'weapon', id: 'crowbar', price: 110 },
    { kind: 'weapon', id: 'sledge', price: 260 }, { kind: 'item', id: 'flashlight', price: FLASHLIGHT_PRICE, qty: 1 },
    ...LIGHT_KIT, { kind: 'item', id: 'hardhat', price: LIGHT_PRICES.hardhat, qty: 1 }, { kind: 'weapon', id: 'heavyflash', price: LIGHT_PRICES.heavyflash }, ...FELL_KIT,   // (lights and felling: #358, #359)
  ] },
  pharmacy: { title: 'MediMart Pharmacy', buy: [
    { kind: 'item', id: 'medkit', price: 80, qty: 1 }, { kind: 'item', id: 'bandage', price: 25, qty: 1 }, { kind: 'item', id: 'revivekit', price: REVIVE_KIT_PRICE, qty: 1 },
  ] },
  coffee: { title: 'Bean Machine Coffee', buy: [{ kind: 'item', id: 'coffee', price: 6, qty: 1 }] },
  convenience: { title: 'Corner Store', buy: [{ kind: 'item', id: 'energy', price: 9, qty: 1 }, { kind: 'item', id: 'coffee', price: 7, qty: 1 }, { kind: 'item', id: 'bandage', price: 30, qty: 1 }, { kind: 'item', id: 'flashlight', price: FLASHLIGHT_PRICE, qty: 1 }], sells: ['apple', 'orange', 'grapes'] },
  gasstation: { title: "Gas 'n Go", buy: [{ kind: 'item', id: 'energy', price: 9, qty: 1 }, { kind: 'item', id: 'coffee', price: 7, qty: 1 }, { kind: 'item', id: 'bandage', price: 30, qty: 1 }, { kind: 'item', id: 'flashlight', price: FLASHLIGHT_PRICE, qty: 1 },
    { kind: 'item', id: 'flare', price: LIGHT_PRICES.flare, qty: 2 }, { kind: 'item', id: 'glowstick', price: LIGHT_PRICES.glowstick, qty: 3 }, { kind: 'item', id: 'batteries', price: LIGHT_PRICES.batteries + 2, qty: 2 }, { kind: 'item', id: 'sawfuel', price: FELL_TOOL_PRICES.sawfuel, qty: 1 }], sells: ['apple', 'orange', 'grapes'] },
  club: { title: 'The Club', buy: [{ kind: 'item', id: 'cocktail', price: 18, qty: 1 }, { kind: 'item', id: 'energy', price: 12, qty: 1 }] },
  vending: { title: 'Vending Machine', buy: [{ kind: 'item', id: 'energy', price: 8, qty: 1 }] },
  pawn: { title: 'Second Chance Pawn', buy: [
    { kind: 'weapon', id: 'pistol', price: 320 }, { kind: 'weapon', id: 'bat', price: 80 }, { kind: 'weapon', id: 'knife', price: 60 },
    { kind: 'weapon', id: 'sword', price: 650 },
  ], sells: ['purse', 'bonds', 'jewelry', 'scrap', 'wallet', 'medkit', 'nugget', 'quartz', 'doubloon', 'goldStar', 'redcap'], sellsWeapons: true },
  fence: { title: 'Back-Alley Exchange (Black Market)', buy: [
    { kind: 'weapon', id: 'smg', price: 1300 }, { kind: 'ammo', id: 'smg', price: 50, qty: 30 },
    { kind: 'weapon', id: 'spistol', price: 950 }, { kind: 'ammo', id: 'spistol', price: 40, qty: 10 },
    { kind: 'weapon', id: 'rocket', price: 6000 }, { kind: 'ammo', id: 'rocket', price: 400, qty: 1 },
    { kind: 'weapon', id: 'katana', price: 1500 },
  ], sells: ['purse', 'bonds', 'jewelry', 'ghostglass', 'goldStar'], sellPrice: { ghostglass: FORAGE_FENCE_GHOSTGLASS, goldStar: 175 } },
  tackle: { title: 'Hook & Line Bait and Tackle', buy: [
    { kind: 'weapon', id: 'rod', price: 60 }, { kind: 'item', id: 'worms', price: 10, qty: 5 }, { kind: 'item', id: 'shrimp', price: 20, qty: 5 },
    { kind: 'item', id: 'squid', price: 35, qty: 3 }, { kind: 'item', id: 'glowlure', price: 30, qty: 3 }, { kind: 'item', id: 'lure', price: 20, qty: 3 },
    { kind: 'weapon', id: 'huntrifle', price: 1100 }, { kind: 'ammo', id: 'huntrifle', price: 40, qty: 10 },
  ], sells: ['bass', 'catfish', 'salmon', 'tuna', 'grouper', 'swordfish', 'marlin'] },
  fishmarket: { title: 'Dockside Fish Market', buy: [{ kind: 'weapon', id: 'rod', price: 75 }, { kind: 'item', id: 'lure', price: 25, qty: 3 }], sells: ['bass', 'catfish', 'salmon', 'tuna', 'grouper', 'swordfish', 'marlin'] },
  charter: { title: 'Pelican Key Charters', buy: [{ kind: 'weapon', id: 'rod', price: 90 }, { kind: 'item', id: 'squid', price: 35, qty: 3 }, { kind: 'item', id: 'lure', price: 20, qty: 3 }], sells: ['grouper', 'swordfish', 'marlin', 'tuna', 'salmon'] },
  smuggler: { title: "Smuggler's Den (members only)", buy: [
    { kind: 'weapon', id: 'smg', price: 1100 }, { kind: 'ammo', id: 'smg', price: 45, qty: 30 },
    { kind: 'weapon', id: 'rocket', price: 5200 }, { kind: 'ammo', id: 'rocket', price: 350, qty: 1 },
    { kind: 'weapon', id: 'shotgun', price: 700 }, { kind: 'ammo', id: 'shotgun', price: 40, qty: 12 },
    { kind: 'weapon', id: 'spistol', price: 850 }, { kind: 'ammo', id: 'spistol', price: 35, qty: 10 },
  ], sells: ['purse', 'bonds', 'jewelry'] },
  clothing: { title: 'Threads Outfitters', buy: [{ kind: 'service', id: 'outfit', price: 120 }], sells: CRAFTED, sellPrice: payFor(CRAFTED, 1.5) },   // (the city pays best for furs and buckskin)
  // the designed places' counters (shared/naturesites.js); sellPrice: what this counter pays, when it beats the usual
  winery: { title: 'Willow River Winery - Tasting Room', buy: [{ kind: 'item', id: 'redwine', price: 30, qty: 1 }, { kind: 'item', id: 'whitewine', price: 30, qty: 1 }, { kind: 'item', id: 'bread', price: 8, qty: 1 }], sells: ['grapes'], sellPrice: { grapes: 10 } },
  fruitstand: { title: 'Willow River Orchard Stand', buy: [{ kind: 'item', id: 'cider', price: 6, qty: 1 }, { kind: 'item', id: 'apple', price: 4, qty: 3 }, { kind: 'item', id: 'orange', price: 5, qty: 3 }], sells: ['apple', 'orange'], sellPrice: { apple: 5, orange: 6 } },
  market: { title: 'Old Town Market', buy: [{ kind: 'item', id: 'bread', price: 7, qty: 1 }, { kind: 'item', id: 'apple', price: 4, qty: 3 }, { kind: 'item', id: 'orange', price: 5, qty: 3 }, { kind: 'item', id: 'grapes', price: 8, qty: 2 }, { kind: 'item', id: 'honey', price: 14, qty: 1 }], sells: ['apple', 'orange', 'grapes', 'honey', 'lavender', 'goldTrumpet', 'bunCap', 'shelfOyster'], sellPrice: { goldTrumpet: 18, bunCap: 15, shelfOyster: 11 } },
  snack: { title: 'Snack Cart', buy: [{ kind: 'item', id: 'hotdog', price: 6, qty: 1 }, { kind: 'item', id: 'lemonade', price: 4, qty: 1 }, { kind: 'item', id: 'energy', price: 9, qty: 1 }] },
  roadhouse: { title: 'The Rusty Spur - the bar', buy: [{ kind: 'item', id: 'beer', price: 6, qty: 1 }, { kind: 'item', id: 'whiskey', price: 9, qty: 1 }, { kind: 'item', id: 'coffee', price: 4, qty: 1 }, { kind: 'item', id: 'hotdog', price: 7, qty: 1 }] },
  clubhouse: { title: 'Cedar Hills Golf Club - The Nineteenth', buy: [{ kind: 'item', id: 'cocktail', price: 20, qty: 1 }, { kind: 'item', id: 'coffee', price: 7, qty: 1 }, { kind: 'item', id: 'redwine', price: 34, qty: 1 }, { kind: 'item', id: 'hotdog', price: 8, qty: 1 }] },
  farmstand: { title: 'Cedar Point Lavender - Farm Stand', buy: [{ kind: 'item', id: 'honey', price: 12, qty: 1 }, { kind: 'item', id: 'lemonade', price: 4, qty: 1 }], sells: ['honey', 'lavender'], sellPrice: { lavender: 6 } },
  salvage: { title: 'Dry Creek Aircraft Salvage', buy: [], sells: ['scrap'], sellPrice: { scrap: 45 } },
  // the hunting places (shared/naturesites.js): the Highland Hunting Lodge sells the whole kit and buys everything a
  // hunter brings in, best of all; the camps' outfitters (by the cliffs, in the desert, at the marsh, on the farmland's
  // edge) keep ammunition, arrows and knives and buy what's hunted round them; the trapper pays most for pelts and
  // parts (and makes clothing from them: CRAFTS); the butcher pays most for meat
  lodge: { title: 'Highland Hunting Lodge', buy: [
    { kind: 'weapon', id: 'huntrifle', price: 900 }, { kind: 'ammo', id: 'huntrifle', price: 35, qty: 10 },
    { kind: 'weapon', id: 'bow', price: 420 }, { kind: 'ammo', id: 'bow', price: 30, qty: 12 },
    { kind: 'weapon', id: 'varmint', price: 520 }, { kind: 'ammo', id: 'varmint', price: 20, qty: 20 },
    { kind: 'weapon', id: 'huntknife', price: 120 }, { kind: 'item', id: 'flashlight', price: FLASHLIGHT_PRICE, qty: 1 }, ...LIGHT_KIT, { kind: 'item', id: 'flare', price: LIGHT_PRICES.flare, qty: 2 }, ...FELL_KIT.slice(0, 3),
    { kind: 'item', id: 'camoCloak', price: 380, qty: 1 }, { kind: 'item', id: 'coverScent', price: 15, qty: 2 }, { kind: 'item', id: 'venisonSteak', price: 30, qty: 1 }],
    sells: [...GAME_GOODS(), ...CRAFTED], sellPrice: payFor(GAME_GOODS(), 1.4), crafts: true },
  huntcamp: { title: 'Hunting Camp Outfitter', buy: [...LIGHT_KIT.slice(0, 3), { kind: 'item', id: 'flare', price: LIGHT_PRICES.flare, qty: 2 }, { kind: 'item', id: 'hatchet', price: FELL_TOOL_PRICES.hatchet, qty: 1 },
    { kind: 'ammo', id: 'huntrifle', price: 40, qty: 10 }, { kind: 'ammo', id: 'bow', price: 34, qty: 12 }, { kind: 'ammo', id: 'varmint', price: 24, qty: 20 },
    { kind: 'weapon', id: 'huntknife', price: 140 }, { kind: 'weapon', id: 'bow', price: 480 }, { kind: 'item', id: 'coverScent', price: 18, qty: 2 },
    { kind: 'item', id: 'bandage', price: 30, qty: 1 }, { kind: 'item', id: 'coffee', price: 8, qty: 1 }],
    sells: GAME_GOODS(), sellPrice: payFor(GAME_GOODS(), 1.15) },
  trapper: { title: "Trapper's Cabin", buy: [{ kind: 'weapon', id: 'huntknife', price: 110 }, { kind: 'ammo', id: 'bow', price: 28, qty: 12 }, { kind: 'item', id: 'coverScent', price: 12, qty: 2 }],
    sells: [...GAME_GOODS().filter((id) => !COOKED_OR_RAW(id)), ...CRAFTED], sellPrice: { ...payFor(GAME_GOODS().filter((id) => !COOKED_OR_RAW(id)), 1.6), ...payFor(CRAFTED, 1.15) }, crafts: true },
  butcher: { title: 'Butcher', buy: [{ kind: 'item', id: 'venisonSteak', price: 28, qty: 1 }, { kind: 'item', id: 'bearStew', price: 34, qty: 1 }, { kind: 'item', id: 'roastTurkey', price: 22, qty: 1 }],
    sells: GAME_GOODS().filter(COOKED_OR_RAW), sellPrice: payFor(GAME_GOODS().filter(COOKED_OR_RAW), 1.8) },
  garage: { title: 'Fresh Coat Garage', buy: [{ kind: 'service', id: 'respray', price: 250 }, { kind: 'service', id: 'wash', price: 20 }, { kind: 'service', id: 'repair', price: 300 }, { kind: 'service', id: 'garage', price: 0 }] },
  dealer: { title: 'Motor Row Dealership', buy: ['cruiser', 'bicycle', 'bmx', 'mtb', 'roadbike', 'cargobike', 'compact', 'sedan', 'bike', 'pickup', 'van', 'flatbed', 'sports',
    // the motorcycles (MC1, task #366)
    'scooter', 'dirtbike', 'caferacer', 'bobber', 'vtwin', 'ratbike', 'chopper', 'tourer', 'bagger', 'trike'].map((id) => ({ kind: 'vehicle', id })) },
  marina: { title: 'Harbor Marina', buy: ['jetski', 'dinghy', 'speedboat'].map((id) => ({ kind: 'vehicle', id })) },
};

export const FISH_TABLE = {
  // base weights: [bass, catfish, salmon, tuna]
  shore: [70, 0, 25, 5],
  river: [60, 0, 35, 5],
  deep: [45, 0, 40, 15],
  offshore: [50, 32, 18], // out at sea from a boat: [grouper, swordfish, marlin]
};
export const OFFSHORE_FISH = ['grouper', 'swordfish', 'marlin'];
