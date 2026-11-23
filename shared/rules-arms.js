// Your weapons' numbers (the owner, 2026-11-14; their notes: shared/rules.js ARMS, which re-exports this): kept in a file of
// their own so the page's quick keys and Inventory (shared/loadout.js, loaded at start-up) read the carry classes without
// all of shared/rules.js, and the art's bake workers (shared/rules-base.js) don't carry them.
export const ARMS = { carry: { gun: 2, melee: 1, throw: 1 }, carryMax: { gun: 4, melee: 2, throw: 2 }, keepMax: 300, dropS: 60, blinkS: 15, giveR: 120, stashKinds: ['gunshop', 'pawn'] };
