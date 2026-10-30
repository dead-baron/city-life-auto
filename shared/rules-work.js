// Working for a living, batch 8 (the owner's notes 2: "Jobs - Forklift driver", "Jobs - Fishing boat", "Park Ranger
// jobs"): the numbers the jobs pay and play by. The server's jobs read them (server/systems/forklift.js, fishboat.js,
// rangerjob.js); the job cards show the pay from them.

// The forklift driver (forklift.js): a shift at a warehouse's or a port's yard - `pallets` pallets waiting in a row,
// lifted on the forks (the fork tips within `reach` px of one, the forklift slow), carried to the marked bay and set down
// there (its middle within `bayR` px); a bay takes two, the second stacked on the first (`palletH` px up). Paid perLoad a
// pallet, `stack` more for one stacked, `bonus` for the lot; liftS to raise or lower the forks; shiftS to do it in
export const FORK = { pallets: 6, perLoad: 45, stack: 20, bonus: 120, reach: 18, bayR: 24, slowPx: 45, liftS: 0.8, palletH: 24, carryZ: 3, shiftS: 1500, rowGap: 46, bayGap: 58, yard: [150, 420] };

// The fishing boat (fishboat.js): the skipper takes the trawler out from a fish market's quay to `spots` fishing grounds
// in turn - a net (trawl: keep moving through the ground between trawl[0] and trawl[1] px/s for netS s) or a string of
// pots (stopped by the buoys - under potStill px/s within potR px - for potS s). Each haul is a box of fish on the deck
// (a haul of fish[0]-fish[1] of one kind from the sea's own, at the market's price for an average one; the pots' crabs and
// lobsters at `pot` each); brought back to the quay (stopped within dockR px of it) the catch sells, `bonus` on top for
// a full deck. Crew aboard (players in the other seats) are paid `crew` a box by the market. Grounds dist[0]-dist[1] px off.
export const FISHBOAT = { spots: 3, spotR: 170, potR: 90, trawl: [35, 190], netS: 10, potStill: 28, potS: 8, fish: [6, 11], pot: 14, bonus: 90, crew: 25, dockR: 300, dist: [700, 2300], shiftS: 2400 };

// The park ranger (rangerjob.js): a shift of tasks round a ranger station (or a trailhead's map board) out in the wild
// country, one after another, gapS between them: walk the trail (`posts` waypoints in turn, each reached within postR
// px), clear the litter (`litter` pieces by a trail or a picnic spot, picked up within pickR), put out a campfire left
// burning (within fireR), find a lost hiker (out 500-1100 px, found within findR) and walk them back to the station
// (within homeR). Paid by the task (pay); the patrol vehicle is the station's 4x4. area: how far out the tasks are, px
export const RANGER = { shiftS: 1800, firstS: 4, gapS: 10, posts: 3, postR: 70, litter: 5, pickR: 36, fireR: 60, findR: 52, homeR: 140, lead: 1.15, area: [260, 1100], pay: { patrol: 85, litter: 95, fire: 110, hiker: 170 } };
