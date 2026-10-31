// The numbers for the park and the camp (the owner's notes part 2, 2026-10-24): feeding the ducks, fireworks, chess at
// the park's tables, a campfire you build yourself - the server's (server/systems/ducks.js, fireworks.js, chess.js,
// campfires.js) and the screens' that load later (client/leisure/), kept out of shared/rules.js, which every page loads
// at once (tools/perf.mjs: the page's code), as shared/rules-music.js keeps the music's. Player-facing all the same.

// Feeding the ducks (server/systems/ducks.js): a bunch of grapes (a corner store, a gas station, the market) thrown to
// the town ponds' tame ducks and geese within reach px of you; the nearest few (up to `ducks`) paddle over and eat it.
// Each feed is worth sam Samaritan points, up to dayCap a day (the real day, UTC) - after that they still eat, for
// nothing; gapS s between feeds (they're still eating). price: what a bunch costs at the counters
export const DUCKS = { reach: 150, ducks: 4, sam: 3, dayCap: 15, gapS: 10, price: 8 };

// Fireworks (server/systems/fireworks.js; the shows: shared/leisure.js fwShow): bought at a corner store or a gas
// station (prices), set down at your feet from the bag and lit - fuseS s of fuse, then the show. They hurt nobody and
// break nothing. maxOut: of yours burning at once; gapS between lighting two. In town after dark (not out in the
// country, not by day) it's a small crime someone can report - "Setting off fireworks in town after dark" (law.js
// 'fireworks': a little heat, an officer may come for a word). seePx: how far off the bursts are seen and heard
export const FIREWORKS = { fuseS: 2.5, maxOut: 3, gapS: 1.5, seePx: 2600, prices: { fwrocket: 15, fwfountain: 10, fwcake: 45 } };

// A campfire of your own (server/systems/campfires.js): a Campfire Kit (kitPrice: hardware stores, gas stations, the
// outfitters) built anywhere on open ground outside - a stack of logs in a ring of stones, log seats round it (seats,
// seatR px out). Nothing stops anyone walking through it (it can't block a door), and it burns like any campfire: sit
// by it to warm up, stand in it for BURN.campS s and you catch fire (shared/rules.js). One a player; walk awayPx off
// for awayS s (or leave the game) and it burns out; it burns lifeS s at most
export const CAMPKIT = { kitPrice: 25, seats: 3, seatR: 34, awayPx: 700, awayS: 60, lifeS: 1200, ahead: 30 };

// Chess at the park's tables (server/systems/chess.js; the rules: shared/chess.js): sit down at a chess table (where
// the old men play) and play whoever sits down across from you, or the park's regular (the computer: thinkS s to make
// a move, a search depth plies deep, plus captures to the end; `noise` centipawns of whim so he doesn't play the same
// game twice). A game nobody moves in for idleS s is called off; reach: how close to the table to sit down
export const CHESS = { reach: 44, thinkS: [1.6, 4.5], depth: 2, nodes: 5000, noise: 22, idleS: 600 };
