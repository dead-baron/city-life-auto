// Your weapons' numbers (the owner, 2026-11-14; their notes: shared/rules.js ARMS, which re-exports this): kept in a file of
// their own so the page's quick keys and Inventory (shared/loadout.js, loaded at start-up) read the carry classes without
// all of shared/rules.js, and the art's bake workers (shared/rules-base.js) don't carry them.
export const ARMS = { carry: { gun: 2, melee: 1, throw: 1 }, carryMax: { gun: 4, melee: 2, throw: 2 }, keepMax: 300, dropS: 60, blinkS: 15, giveR: 120, stashKinds: ['gunshop', 'pawn'] };
// The stash, opened (the owner, 11-23; server/systems/stash.js): one pool of what you own and don't carry - items and weapons
// (clothes stay in your wardrobe, never at risk) - opened from its doors: your home (inside it), a gun or pawn shop's
// counter, your (or your crew's) hideout's office. reach: px from the door it was opened at before it closes.
export const STASH = { reach: 160 };
// A vehicle's trunk (the owner, 11-23, Claude's suggestion: its own small storage, not a door to the stash; server/systems/
// trunk.js): slots - stacks of a thing or a weapon each - by the vehicle's kind; reach: px from its back you open it from.
// It stays in a parked vehicle, waits with an impounded one, spills where it is wrecked. Cargo crates never go in (they ride
// in the open: cargo.js).
export const TRUNK = { slots: { car: 6, bike: 2, boat: 6, truck: 10 }, reach: 40 };
