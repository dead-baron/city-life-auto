import { STONE_PRICE } from './rules-base.js';
// The numbers for what only the server plays out - the police dogs, riders knocked off, the ways in and out, cutting up a
// felled trunk - kept out of shared/rules.js, which every page loads at once (tools/perf.mjs: the page's code), as
// shared/rules-games.js keeps the games of chance. Player-facing all the same: read them here.
// K9 units (server/systems/k9.js): share of the patrol cars sent after someone on foot at stars..maxStars that carry a
// dog; walked in on a leash px lead, let go within release px of the suspect (or holdS s out, within 1.6x that); it runs
// at speed x a run (a little faster than a sprint), after anyone wanted within sight px of its handler; within reach px
// it has hold of them for up to latchS s: their speed x drag, dps health a second (not below floor of it); mash attack
// presses shake it off, `every` s before it tries again; hit, it's slowed (slowMul) slowS s; below limpAt of its hp it
// limps off (limpMul) for limpS s - never killed
export const K9 = { share: 0.3, stars: 2, maxStars: 3, speed: 1.36, sight: 800, reach: 22, leash: 24, release: 260, holdS: 10, latchS: 4, drag: 0.45, dps: 3, floor: 0.35, mash: 4, every: 4, slowS: 2.5, slowMul: 0.55, limpAt: 0.5, limpS: 10, limpMul: 0.3, hp: 70 };
// Riders out in the open (bikes, motorbikes, horses, carts, skateboards, jet skis, open boats - vehicles.js openRide;
// the owner's notes 2, 10-24: "they should fall off if they get injured enough or die while on a vehicle"): a hit of
// big x their health or more, or one that leaves them below hp of it, throws them off (push px/s on top of the
// vehicle's momentum, a tumble; off a boat into the water); dying up there always does
export const RIDER_KNOCK = { big: 0.3, hp: 0.45, push: 150 };
// Ways in and out (server/systems/doorways.js): on foot within r px of a door, a doorway, a garage or a station's way
// out, you walk through a vehicle standing there (and on through it till you're clear: keepS s after you last overlap)
export const DOORWAY = { r: 56, keepS: 0.3 };
// Bucking a felled tree (server felling.js; the owner's notes 2, 10-24: "you still have to chop the whole tree up and then
// it puts the wood into bundles that looks like stacked wood"): a round takes `work` (a tool's felling rate x seconds:
// an axe about 1.5 s of strokes) within reach px of it; each round is a firewood bundle - a crate to carry or load - the
// hardware stores pay LOG_BUNDLE_PRICE for, a sawmill or lumber yard mill; a felled trunk nobody cuts up is gone after
// LOGS_LIFE_S. Stacked at your home's garage, the bundles are kept there (a count per home) for its upgrades
export const FIREWOOD = { work: 2.4, reach: 36, mill: 65 };
// The bathhouses (server/systems/bathhouse.js; the owner, 10-16: "Bathhouses and locker rooms with usable showers; NPCs
// going through the routine"): in through the door to the lobby, the day pass bought at the desk (fee dollars) opens
// the curtains to the locker rooms - change into a bathing suit at the lockers (stash things there while you bathe:
// back to you on the way out), the showers (showerS s: washes off the blood and the dirt, stops the bleeding, puts out a
// burn, heal health back), then the bath (soak in it; the house rule: a shower first) - a soak of soakS s or more
// leaves you refreshed for buffS s (stamina back faster, as a coffee does) and heals soakHeal health a second while
// you're in. bathers: how many of the city's people are in there going through the routine, at most; arriveS: a new
// one about every so many seconds while someone's inside. Blood and dirt on you (ped.grime: 0..1 each): blood x a hit's
// share of your health, kill when you kill someone up close (within close px), dirt from a tumble or crawling;
// swimming washes it off, rain the dirt slowly (rainS: from all of it to none). Blood over seen of it: people step
// away from you and police within copR px grow suspicious (once every eyeS s - never a star by itself)
export const BATH = { fee: 8, showerS: 3, heal: 10, soakS: 6, soakHeal: 1.2, buffS: 180, bathers: 6, arriveS: 14, kill: 0.6, close: 70, tumble: 0.35, crawl: 0.15, rainS: 120, seen: 0.45, copR: 360, eyeS: 45 };
// Home upgrades (server/systems/homeups.js; what each is and where: shared/homeups.js; the owner's notes 2, 10-24: "You
// can do this by gathering materials like wood or stone or other things across the world, or you can purchase them with
// money outright"): what each takes - the builders' labour (dollars) and the materials (wood: bundles of firewood,
// stone: building stone, metal: scrap metal or iron and copper ore). Whatever material is missing can be paid for at
// MAT_PRICE a piece, so an upgrade bought outright costs its labour and all of its materials at that price. A room's
// cost is by its kind (room:<kind>).
export const MAT_PRICE = { wood: 70, stone: STONE_PRICE, metal: 35 };
export const HOME_UPS = {
  floor2: { labour: 9000, wood: 24, stone: 12, metal: 6 },
  floor3: { labour: 14000, wood: 30, stone: 16, metal: 8 },
  basement: { labour: 8000, wood: 12, stone: 30, metal: 6 },
  'room:bed': { labour: 1500, wood: 8, metal: 1 },
  'room:bath': { labour: 2500, wood: 2, stone: 8, metal: 4 },
  'room:study': { labour: 1200, wood: 10 },
  'room:gym': { labour: 1800, wood: 2, metal: 8 },
  'room:games': { labour: 2500, wood: 8, metal: 3 },
  'room:cinema': { labour: 4000, wood: 6, metal: 5 },
  'room:workshop': { labour: 1500, wood: 8, metal: 4 },
  'room:cellar': { labour: 2500, wood: 4, stone: 10 },
  'room:store': { labour: 800, wood: 6, metal: 2 },
  'room:sun': { labour: 1500, wood: 6, stone: 4 },
  fireplace: { labour: 1500, stone: 12, metal: 2 },
  hottub: { labour: 4500, wood: 6, metal: 4 },
  bar: { labour: 1800, wood: 6 },
  bike: { labour: 600, metal: 4 },
  garden1: { labour: 600, wood: 4, stone: 6 },
  garden2: { labour: 900, wood: 4, stone: 8 },
  parking1: { labour: 4000, stone: 10, metal: 4 },
  parking2: { labour: 6000, stone: 12, metal: 4 },
  shelving: { labour: 400, wood: 4, metal: 2 },
};
// How much a home's garage keeps of the materials (all of them together, a bundle or a block or a piece each): base by
// the plan, + shelving (the upgrade's own store), + the basement and each storeroom below; back: what selling the place
// pays for its upgrades (a share of what they'd cost now). The fireplace burns a bundle for fireS s: everyone in the
// home gets heal health a second; the bar's glass (the wine's buff) once every barS s; the exercise bike: a stroke of
// the stamina skill every bikeS s on it (skills.js 'bike', capped a day)
export const HOME_STORE = { base: { trailer: 20, apartment: 10, studio: 8, penthouse: 16, house: 30, mansion: 50 }, basement: 40, room: 30, back: 0.5 };
export const HOME_AMEN = { fireS: 480, heal: 0.6, barS: 90, bikeS: 4, tubHeal: 2.5 };
// The workbench (a workshop's, or one you placed): furniture made from your home's materials - the piece into storage,
// placed with Decorate (shared/homedecor.js PIECES). The crafting the bag will grow into starts here: a recipe is what it
// makes and the materials it takes
export const HOME_CRAFTS = {
  bedside: { wood: 1 }, bookshelf: { wood: 3 }, table: { wood: 4 }, armchair: { wood: 2, metal: 1 }, couch: { wood: 4, metal: 1 },
  plant: { stone: 1 }, workbench: { wood: 3, metal: 2 }, shelves: { wood: 2, metal: 1 }, woodpile: { wood: 2 },
};
// Firewood orders (server/systems/woodjob.js; the owner's notes 2, 10-24: the wood "you can deliver that somewhere that
// purchases wood, or is part of a job"): at a sawmill or lumber yard (the phone's Jobs too) a diner, a cafe, a bar, a
// hotel, a camp wants n[0]..n[1] bundles of firewood for its stove or its fire: per a bundle delivered (better than the
// mill's price), bonus for the lot, limitS s to do it in; r px from its door to hand them over (carried, or off the bed)
export const WOODJOB = { n: [3, 6], per: 95, bonus: 160, limitS: 1800, r: 110, minD: 900 };
