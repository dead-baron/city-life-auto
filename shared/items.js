// Weapons, items, crates, loot bags and shop catalogs (GDD §8, §9, §11, §14A).

export const WEAPONS = {
  fists:    { i: 0,  name: 'Fists',            type: 'melee', dmg: 10, range: 28, arc: 1.4, cd: 0.42, push: 95 },
  bat:      { i: 1,  name: 'Baseball Bat',     type: 'melee', dmg: 22, range: 36, arc: 1.5, cd: 0.6 },
  knife:    { i: 2,  name: 'Knife',            type: 'melee', dmg: 26, range: 26, arc: 1.1, cd: 0.4, bleed: true },
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
};
export const WEAPON_BY_INDEX = [];
for (const [id, w] of Object.entries(WEAPONS)) { w.id = id; WEAPON_BY_INDEX[w.i] = w; }

export const ITEMS = {
  medkit:  { name: 'Medical Kit',   heal: 60, stopBleed: true, sell: 30 },
  bandage: { name: 'Field Bandage', heal: 15, stopBleed: true, sell: 8 },
  coffee:  { name: 'Hot Coffee',    stamina: true, buff: 'coffee', sell: 0 },
  energy:  { name: 'Energy Drink',  stamina: true, buff: 'energy', sell: 0 },
  lure:    { name: 'Shiny Lure',    bait: true, sell: 5 },
  bass:    { name: 'Common Green Bass', fish: 1, sell: 35 },
  catfish: { name: 'Night Catfish',     fish: 2, sell: 70 },
  salmon:  { name: 'Rare Silver Salmon', fish: 3, sell: 120 },
  tuna:    { name: 'Legendary Bluefin Tuna', fish: 4, sell: 480 },
  purse:   { name: 'Snatched Purse',    loot: true, sell: 180 },
  bonds:   { name: 'Bearer Bonds',      loot: true, sell: 140 },
  jewelry: { name: 'Diamond Earrings',  loot: true, sell: 220 },
  scrap:   { name: 'Component Scrap',   loot: true, sell: 30 },
  wallet:  { name: 'Lost Wallet',       loot: true, sell: 60 },
};

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
  ] },
  sports: { title: 'Home Run Sports', buy: [
    { kind: 'weapon', id: 'bat', price: 120 }, { kind: 'weapon', id: 'rod', price: 60 },
    { kind: 'item', id: 'lure', price: 20, qty: 3 },
  ] },
  hardware: { title: 'Nail & Gear Hardware', buy: [
    { kind: 'weapon', id: 'knife', price: 90 }, { kind: 'weapon', id: 'crowbar', price: 110 },
    { kind: 'weapon', id: 'sledge', price: 260 },
  ] },
  pharmacy: { title: 'MediMart Pharmacy', buy: [
    { kind: 'item', id: 'medkit', price: 80, qty: 1 }, { kind: 'item', id: 'bandage', price: 25, qty: 1 },
  ] },
  coffee: { title: 'Bean Machine Coffee', buy: [{ kind: 'item', id: 'coffee', price: 6, qty: 1 }] },
  vending: { title: 'Vending Machine', buy: [{ kind: 'item', id: 'energy', price: 8, qty: 1 }] },
  pawn: { title: 'Second Chance Pawn', buy: [
    { kind: 'weapon', id: 'pistol', price: 320 }, { kind: 'weapon', id: 'bat', price: 80 }, { kind: 'weapon', id: 'knife', price: 60 },
  ], sells: ['purse', 'bonds', 'jewelry', 'scrap', 'wallet', 'medkit'], sellsWeapons: true },
  fence: { title: 'Back-Alley Exchange (Black Market)', buy: [
    { kind: 'weapon', id: 'smg', price: 1300 }, { kind: 'ammo', id: 'smg', price: 50, qty: 30 },
    { kind: 'weapon', id: 'rocket', price: 6000 }, { kind: 'ammo', id: 'rocket', price: 400, qty: 1 },
  ], sells: ['purse', 'bonds', 'jewelry'] },
  fishmarket: { title: 'Dockside Fish Market', buy: [{ kind: 'weapon', id: 'rod', price: 75 }, { kind: 'item', id: 'lure', price: 25, qty: 3 }], sells: ['bass', 'catfish', 'salmon', 'tuna'] },
  clothing: { title: 'Threads Outfitters', buy: [{ kind: 'service', id: 'outfit', price: 120 }] },
  garage: { title: 'Fresh Coat Garage', buy: [{ kind: 'service', id: 'respray', price: 250 }, { kind: 'service', id: 'wash', price: 20 }, { kind: 'service', id: 'repair', price: 300 }, { kind: 'service', id: 'garage', price: 0 }] },
  dealer: { title: 'Motor Row Dealership', buy: ['compact', 'sedan', 'bike', 'pickup', 'van', 'flatbed', 'sports'].map((id) => ({ kind: 'vehicle', id })) },
  marina: { title: 'Harbor Marina', buy: ['dinghy', 'speedboat'].map((id) => ({ kind: 'vehicle', id })) },
};

export const FISH_TABLE = {
  // base weights: [bass, catfish, salmon, tuna]
  shore: [70, 0, 25, 5],
  river: [60, 0, 35, 5],
  deep: [45, 0, 40, 15],
};
