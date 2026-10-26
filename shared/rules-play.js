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
