## 2026-10-30 - Batch 8b: forklift, fishing boat and park ranger jobs; people at their jobs

The owner's notes, part 2 (the new ideas): "Jobs - Forklift driver", "Jobs - Fishing boat", "Park Ranger jobs", "NPC jobs -
You can see NPCs performing their jobs like street sweepers or construction workers or mailmen or other jobs around the
world", "NPC - Mail man, postal service, they go about their job delivering mail" and "NPC - homeless dude pushing cart?".
Each job uses the existing job card. The phone's Jobs app lists it, and Act at the job's place brings up the same card:
what the job is, what it pays, and the first step, with one Accept. All of their numbers are in a new file,
**shared/rules-work.js** (FORK, FISHBOAT, RANGER).

### What was there already
- **The homeless man with his cart:**
  - personas.js `homeless` pushes his cart around his camp and sits by it;
  - the cart and the push walk are in people.js.
- **Mail carriers:** the persona `postal` (b6c) existed, in a postal shirt with a satchel, but only wandered.
- **Construction workers:**
  - the road crew at Holly Street (activities.js `roadcrew`);
  - miners at the quarries.
- **Park rangers:** wildfolk.js rangers walk a beat and give tips.
- **Models:**
  - a forklift prop (in the bake only, not drivable);
  - the fishing trawler (fleet.js).
- **Fishing:** the fish table (shared/fish.js).

### Forklift driver (server/systems/forklift.js)
- **Signing on:**
  - Act by one of the forklifts parked at a port or warehouse yard (the map's forklift props, with the warehouses'
    doors as a fallback; not the airport apron's ground-crew forklifts), or take the job from the phone.
  - A **Forklift** is issued like a work truck: green ring, recalled if you quit. It is a new drivable vehicle
    (shared/vehicles.js, i 85), modelled in client/art2/fleet.js: a yellow body with a counterweight, a seat under the
    overhead guard, an amber beacon, the mast, and a carriage with two tines.
- **The yard:**
  - A row of 6 pallets waits on the yard's open ground.
  - A row of bays is marked a little way off (`layout`, with room to drive up to each).
- **The work:**
  - Drive the fork tips up to a pallet and **Act - Lift the pallet**. It goes on the forklift's one cargo slot, out in
    front, and the forks rise.
  - Drive it to the marked bay and **Act - Set the pallet down in bay N**. The forks lower it.
  - The second pallet in a bay is **stacked**: the forks rise to the first pallet's height first, then lower the second
    onto it. A pallet sitting on another stays up while the one under it is there (cargo.js `c.on`).
  - Pallets are too heavy to lift by hand.
- **Pay:**
  - $45 a pallet, $20 more for a stacked one;
  - a $120 bonus for all six;
  - the work truck's return bonus as usual.
- **What everyone sees:**
  - The forks' height goes to clients in the vehicle's extra byte (bits 3-4, net.js `forkStage`).
  - The renderer draws the carriage at that height (host.js, actors.js `reel`).
  - The pallet rides on the tines (host.js and main.js add a loaded crate's z).
- **New crate model:** 'Pallet', a wooden pallet of taped cartons.

### Fishing boat (server/systems/fishboat.js)
- **Signing on:**
  - Act on a fish market's quay by the trawler's berth (the market's door stays its shop), or take the job from the
    phone.
  - The market's **Fishing Trawler** is issued at the quay: open water near the market, on the sea.
- **The grounds:** three, out at sea, taken in turn:
  - **net** grounds: **Act - Shoot the net**, then keep her moving through the ground at trawling speed (35-190 px/s)
    for 10 s;
  - **pots**: **Act - Haul the pots**, then hold her still by the buoys for 8 s.
- **The catch:**
  - Each haul is a **Fish Box** on the deck: a haul of 6-11 of one of the sea's shoaling fish from shared/fish.js
    (mackerel, bonito, skipjack, squid and others), priced at the fish market's price for an average one.
  - The pots bring up crabs and lobsters at $14 each.
  - The boxes are open cargo, so rivals can take them.
- **Selling:**
  - Back at the quay, stopped, **Act - Sell the catch**.
  - A $90 bonus for a full deck.
  - Anyone riding along (crew) is paid $25 a box by the market.
- **New crate model:** 'Fish Box', a blue tray of fish on ice.

### Park ranger (server/systems/rangerjob.js)
- **Signing on:** Act at a ranger station (World v3: Pine Ridge and Granite Cove) or at a trailhead's map board out in the
  wild, or take the job from the phone. The station's 4x4 is issued, in park green.
- **The shift:** radio calls one after another, in a shuffled order, each paid:
  - **Walk the trail:** the waymarks, map boards and picnic spots near the station, in turn ($85).
  - **Clear the litter:** 5 pieces at a picnic spot. **Act - Pick up the litter** by each ($95). New crate model
    'Litter': a burst bin bag, a can, a cup.
  - **Put out a campfire left burning:** one of the map's campfires is lit, and kept lit until you **Act - Put out the
    unattended campfire** ($110).
  - **Find a lost hiker:** they wave for help (the hail pose) out in the woods.
    - **Act - Help the lost hiker** and they follow you.
    - Stop the 4x4 by them and they climb in.
    - Bring them back to the station ($170).
- Each task is also +2 Samaritan.
- Whatever is left of a task when the shift ends (litter, a waiting hiker) is cleared away.
- Poachers are left for later: hunting.js already fines poaching that a ranger sees.

### People at their jobs (server/systems/personas.js, activities.js)
- **Mail carriers** walk a round of the mailboxes near them (the map's 1,306 mailbox props). At each one they stop and
  hold out a bundle of letters (new prop `letters`), then go on to the next.
- **Street sweepers** are a new persona in the town districts by day, in orange coveralls (npclooks' `sweeper`). They push
  a push broom (new prop `broom`) slowly along a stretch of pavement and back, pausing at each end.
- **Gardeners** kneel at the planters and hedges near them for a while, one after another.
- **The homeless man** now also goes through the bins near his camp (the map's trash cans). Now and then he says
  something to himself ("Cans, cans...").
- **Building sites:** each building of kind `construction` (3 in World v3) gets a crew out front. Two work the frame with
  picks and hammers, one is down on a knee, one carries a crate back and forth, and the foreman watches.
- If trouble comes, a carrier or gardener stops mid-job and gets up and away (the pose is reset).

### Controls
Act (E / B / ACT) does all of it. README rows: Forklift driver, Fishing boat, Park ranger. The job card row now names the
new places.

### Debug menu
New section "Forklift, fishing boat & ranger":
- the forklift at the nearest yard (`{ c: 'forklift', k: 'lift' | 'bay' }` stages a lift and a carry);
- the trawler at the nearest quay (`k: 'haul'` lands a haul);
- each ranger task (`k`, `go: 1` to stand by it).

### Budgets
- **Renderer and bake (full):** the new art is the three crate models (actors.js), the broom and the letters
  (people.js) and the fork height (host.js). The forklift's model is in fleet.js, which loads on use and is outside both.
  To make room, I cut actors.js's 37-line header comment down to 5 lines.
- **Results (KB):** renderer 401.1 / 401, bake 906.2 / 906, page 468.2 / 520. Unchanged, no raises.

### Tests
- **test/workjobs.test.js:**
  - the three cards on the board;
  - the forklift's six pallets lifted, carried, set down and stacked, with the pay and the bonus;
  - the fork stages;
  - the trawler's net and pots hauled, the catch sold, the crew paid;
  - each ranger task paid;
  - the leftovers tidied;
  - the job tracker.
- **test/townwork.test.js:**
  - the mail carrier's round with letters at a mailbox;
  - the sweeper's stretch;
  - the gardener kneeling;
  - the homeless man off to a bin;
  - a building site's crew.
