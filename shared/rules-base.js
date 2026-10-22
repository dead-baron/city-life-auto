// Game numbers the map's runtime, the barriers and the item list read (shared/cells.js, levels.js, items.js) - and so
// the art's bake workers, which load those: kept out of shared/rules.js so the workers don't download all of it (25 KB
// gzipped, 2026-10-18). shared/rules.js re-exports every one, so it stays the one place to import game numbers from;
// each keeps its note there too.
export const CELL_CAP = 4;             // people a cell takes (a prisoner goes to the cell with the fewest in it - shared/cells.js)
export const REVIVE_KIT_PRICE = 50;           // hospitals and pharmacies; never used up, only works on someone else
export const FORAGE_FENCE_GHOSTGLASS = 70;   // what the Back-Alley Exchange pays a cap (nobody else will touch them)
export const BARRIER_BREAK_SPEED = 300;    // ram a highway barrier this fast (px/s, straight into it) and it gives way
export const SKATEBOARD_PRICE = 85;
export const SURFBOARD_PRICE = 160;   // a surfboard at the surf shops and the sports shops (server/systems/surf.js)
// A horse (#325; shared/vehicles.js horse, shared/physics.js, server/systems/horses.js): it canters at canter x its top
// speed; spurred (Sprint) it gallops flat out while its wind lasts - galS seconds from fresh - and gets it back at a walk
// or standing (backS s from blown to fresh; at a canter three times as long). Hire one at the livery for hire (hireS s on
// the clock, overdue graceS and it's reported stolen) or buy one (price, its coat your pick of what's in the corral); a
// farm's horse ridden off is horse theft (as a car taken is vehicle theft).
export const HORSE = { canter: 0.62, galS: 10, backS: 14, hire: 25, hireS: 600, graceS: 60, price: 1800 };
export const PARACHUTE_PRICE = 150;   // (a parachute: one jump - server/systems/skydive.js)
export const DRILL_PRICE = 1200;   // (a thermal drill for a bank's vault, at the black market - server/systems/heist.js)
export const FLASHLIGHT_PRICE = 35;        // hardware stores, corner stores and gas stations; it goes in your bag and never wears out
export const LIGHT_PRICES = { headlamp: 45, hardhat: 75, lantern: 55, heavyflash: 95, flare: 12, glowstick: 5, batteries: 8 };
export const FELL_TOOL_PRICES = { hatchet: 40, axe: 120, fellaxe: 260, chainsaw: 650, sawfuel: 15 };
export const PICK_PRICES = { pickStone: 30, pickIron: 95, pickSteel: 280, pickDiamond: 1250 };
export const ASSAY_PAYS = 1.3;             // the quarry's assay office pays this much over what a pawn shop does
export const GARDEN = { plots: 4, reach: 34, waterDays: 0.5, wiltDays: 0.35, dieDays: 1.5, prize: 0.1, prizeX: 6 };
export const GARDEN_CROPS = {
  tomato: { seeds: 10, days: 1.5, yield: 3, sell: 6, heal: 8 },
  carrot: { seeds: 8, days: 1.2, yield: 4, sell: 4, heal: 6 },
  lettuce: { seeds: 8, days: 1, yield: 2, sell: 7, heal: 7 },
  pumpkin: { seeds: 16, days: 2.5, yield: 1, sell: 34, heal: 20 },
  corn: { seeds: 9, days: 1.8, yield: 3, sell: 6, heal: 7 },   // (H78: the FA5 concept's other three)
  strawberry: { seeds: 12, days: 1.4, yield: 5, sell: 4, heal: 5 },
  sunflower: { seeds: 7, days: 2, yield: 2, sell: 12, heal: 3 },
};
