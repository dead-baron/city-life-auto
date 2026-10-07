import { REVIVE_KIT_PRICE, FLASHLIGHT_PRICE, FORAGE_FENCE_GHOSTGLASS } from './rules.js';
// Weapons, items, crates, loot bags and shop catalogs (GDD §8, §9, §11, §14A).

export const WEAPONS = {
  fists:    { i: 0,  name: 'Fists',            type: 'melee', dmg: 10, range: 28, arc: 1.4, cd: 0.42, push: 95 },
  bat:      { i: 1,  name: 'Baseball Bat',     type: 'melee', dmg: 22, range: 36, arc: 1.5, cd: 0.6 },
  knife:    { i: 2,  name: 'Knife',            type: 'melee', dmg: 26, range: 26, arc: 1.1, cd: 0.4, bleed: true, quiet: true, backstab: true },
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
  lemonade: { name: 'Lemonade',         stamina: true, buff: 'coffee', sell: 0 },
  cider:   { name: 'Apple Cider',       stamina: true, buff: 'coffee', sell: 0 },
  redwine: { name: 'Willow River Red',  buff: 'wine', sell: 12 },   // a glass or two: you heal faster for a couple of minutes
  whitewine: { name: 'Willow River White', buff: 'wine', sell: 12 },
};

// What kind of thing an item is (the bag's sections and the dev give menu).
export const ITEM_CATS = [
  { id: 'tools', name: 'Tools & equipment' }, { id: 'medical', name: 'Medical' }, { id: 'drinks', name: 'Drinks' },
  { id: 'bait', name: 'Fishing bait' }, { id: 'fish', name: 'Fish' }, { id: 'food', name: 'Food' }, { id: 'loot', name: 'Loot & valuables' },
];
export function itemCat(id) {
  const it = ITEMS[id];
  if (!it) return null;
  return it.tool ? 'tools' : it.food ? 'food' : it.heal ? 'medical' : it.buff || it.stamina ? 'drinks' : it.bait ? 'bait' : it.fish ? 'fish' : 'loot';
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
  ] },
  pharmacy: { title: 'MediMart Pharmacy', buy: [
    { kind: 'item', id: 'medkit', price: 80, qty: 1 }, { kind: 'item', id: 'bandage', price: 25, qty: 1 }, { kind: 'item', id: 'revivekit', price: REVIVE_KIT_PRICE, qty: 1 },
  ] },
  coffee: { title: 'Bean Machine Coffee', buy: [{ kind: 'item', id: 'coffee', price: 6, qty: 1 }] },
  convenience: { title: 'Corner Store', buy: [{ kind: 'item', id: 'energy', price: 9, qty: 1 }, { kind: 'item', id: 'coffee', price: 7, qty: 1 }, { kind: 'item', id: 'bandage', price: 30, qty: 1 }, { kind: 'item', id: 'flashlight', price: FLASHLIGHT_PRICE, qty: 1 }], sells: ['apple', 'orange', 'grapes'] },
  gasstation: { title: "Gas 'n Go", buy: [{ kind: 'item', id: 'energy', price: 9, qty: 1 }, { kind: 'item', id: 'coffee', price: 7, qty: 1 }, { kind: 'item', id: 'bandage', price: 30, qty: 1 }, { kind: 'item', id: 'flashlight', price: FLASHLIGHT_PRICE, qty: 1 }], sells: ['apple', 'orange', 'grapes'] },
  club: { title: 'The Club', buy: [{ kind: 'item', id: 'cocktail', price: 18, qty: 1 }, { kind: 'item', id: 'energy', price: 12, qty: 1 }] },
  vending: { title: 'Vending Machine', buy: [{ kind: 'item', id: 'energy', price: 8, qty: 1 }] },
  pawn: { title: 'Second Chance Pawn', buy: [
    { kind: 'weapon', id: 'pistol', price: 320 }, { kind: 'weapon', id: 'bat', price: 80 }, { kind: 'weapon', id: 'knife', price: 60 },
  ], sells: ['purse', 'bonds', 'jewelry', 'scrap', 'wallet', 'medkit', 'nugget', 'quartz', 'doubloon', 'goldStar', 'redcap'], sellsWeapons: true },
  fence: { title: 'Back-Alley Exchange (Black Market)', buy: [
    { kind: 'weapon', id: 'smg', price: 1300 }, { kind: 'ammo', id: 'smg', price: 50, qty: 30 },
    { kind: 'weapon', id: 'spistol', price: 950 }, { kind: 'ammo', id: 'spistol', price: 40, qty: 10 },
    { kind: 'weapon', id: 'rocket', price: 6000 }, { kind: 'ammo', id: 'rocket', price: 400, qty: 1 },
  ], sells: ['purse', 'bonds', 'jewelry', 'ghostglass', 'goldStar'], sellPrice: { ghostglass: FORAGE_FENCE_GHOSTGLASS, goldStar: 175 } },
  tackle: { title: 'Hook & Line Bait and Tackle', buy: [
    { kind: 'weapon', id: 'rod', price: 60 }, { kind: 'item', id: 'worms', price: 10, qty: 5 }, { kind: 'item', id: 'shrimp', price: 20, qty: 5 },
    { kind: 'item', id: 'squid', price: 35, qty: 3 }, { kind: 'item', id: 'glowlure', price: 30, qty: 3 }, { kind: 'item', id: 'lure', price: 20, qty: 3 },
  ], sells: ['bass', 'catfish', 'salmon', 'tuna', 'grouper', 'swordfish', 'marlin'] },
  fishmarket: { title: 'Dockside Fish Market', buy: [{ kind: 'weapon', id: 'rod', price: 75 }, { kind: 'item', id: 'lure', price: 25, qty: 3 }], sells: ['bass', 'catfish', 'salmon', 'tuna', 'grouper', 'swordfish', 'marlin'] },
  charter: { title: 'Pelican Key Charters', buy: [{ kind: 'weapon', id: 'rod', price: 90 }, { kind: 'item', id: 'squid', price: 35, qty: 3 }, { kind: 'item', id: 'lure', price: 20, qty: 3 }], sells: ['grouper', 'swordfish', 'marlin', 'tuna', 'salmon'] },
  smuggler: { title: "Smuggler's Den (members only)", buy: [
    { kind: 'weapon', id: 'smg', price: 1100 }, { kind: 'ammo', id: 'smg', price: 45, qty: 30 },
    { kind: 'weapon', id: 'rocket', price: 5200 }, { kind: 'ammo', id: 'rocket', price: 350, qty: 1 },
    { kind: 'weapon', id: 'shotgun', price: 700 }, { kind: 'ammo', id: 'shotgun', price: 40, qty: 12 },
    { kind: 'weapon', id: 'spistol', price: 850 }, { kind: 'ammo', id: 'spistol', price: 35, qty: 10 },
  ], sells: ['purse', 'bonds', 'jewelry'] },
  clothing: { title: 'Threads Outfitters', buy: [{ kind: 'service', id: 'outfit', price: 120 }] },
  // the designed places' counters (shared/naturesites.js); sellPrice: what this counter pays, when it beats the usual
  winery: { title: 'Willow River Winery - Tasting Room', buy: [{ kind: 'item', id: 'redwine', price: 30, qty: 1 }, { kind: 'item', id: 'whitewine', price: 30, qty: 1 }, { kind: 'item', id: 'bread', price: 8, qty: 1 }], sells: ['grapes'], sellPrice: { grapes: 10 } },
  fruitstand: { title: 'Willow River Orchard Stand', buy: [{ kind: 'item', id: 'cider', price: 6, qty: 1 }, { kind: 'item', id: 'apple', price: 4, qty: 3 }, { kind: 'item', id: 'orange', price: 5, qty: 3 }], sells: ['apple', 'orange'], sellPrice: { apple: 5, orange: 6 } },
  market: { title: 'Old Town Market', buy: [{ kind: 'item', id: 'bread', price: 7, qty: 1 }, { kind: 'item', id: 'apple', price: 4, qty: 3 }, { kind: 'item', id: 'orange', price: 5, qty: 3 }, { kind: 'item', id: 'grapes', price: 8, qty: 2 }, { kind: 'item', id: 'honey', price: 14, qty: 1 }], sells: ['apple', 'orange', 'grapes', 'honey', 'lavender', 'goldTrumpet', 'bunCap', 'shelfOyster'], sellPrice: { goldTrumpet: 18, bunCap: 15, shelfOyster: 11 } },
  snack: { title: 'Snack Cart', buy: [{ kind: 'item', id: 'hotdog', price: 6, qty: 1 }, { kind: 'item', id: 'lemonade', price: 4, qty: 1 }, { kind: 'item', id: 'energy', price: 9, qty: 1 }] },
  clubhouse: { title: 'Cedar Hills Golf Club - The Nineteenth', buy: [{ kind: 'item', id: 'cocktail', price: 20, qty: 1 }, { kind: 'item', id: 'coffee', price: 7, qty: 1 }, { kind: 'item', id: 'redwine', price: 34, qty: 1 }, { kind: 'item', id: 'hotdog', price: 8, qty: 1 }] },
  farmstand: { title: 'Cedar Point Lavender - Farm Stand', buy: [{ kind: 'item', id: 'honey', price: 12, qty: 1 }, { kind: 'item', id: 'lemonade', price: 4, qty: 1 }], sells: ['honey', 'lavender'], sellPrice: { lavender: 6 } },
  salvage: { title: 'Dry Creek Aircraft Salvage', buy: [], sells: ['scrap'], sellPrice: { scrap: 45 } },
  garage: { title: 'Fresh Coat Garage', buy: [{ kind: 'service', id: 'respray', price: 250 }, { kind: 'service', id: 'wash', price: 20 }, { kind: 'service', id: 'repair', price: 300 }, { kind: 'service', id: 'garage', price: 0 }] },
  dealer: { title: 'Motor Row Dealership', buy: ['bicycle', 'compact', 'sedan', 'bike', 'pickup', 'van', 'flatbed', 'sports'].map((id) => ({ kind: 'vehicle', id })) },
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
