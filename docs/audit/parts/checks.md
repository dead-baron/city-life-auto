## 1. World checks

Every row runs over the whole World v3 map (seed 1337, as the server builds it) in `npm test` (`test/placementlint.test.js`),
each held at today's count in `tools/placementlint.mjs` `LINT_ALLOW`: a fix brings it down, nothing can push it up. The new rows'
code is `tools/audit/worldrows.mjs` (what each means is at its top); branch `egret`'s three rows (`signCovered`, `doorOnGrass`,
`wallOnly`) are carried into the lint here as they are on `egret`, counted on main's world (before egret's class fixes - egret
ships them at 159 / 372 / 17). Every hit, with its district and tile, is in `docs/audit/hits.json`.

Rerun: `node --max-old-space-size=3072 tools/audit/run-lint.mjs` (one build, ~3 min; rewrites hits.json), then
`node tools/audit/report-tables.mjs > docs/audit/parts/tables.md`. `tools/audit/harness.mjs` keeps a built world in memory to
try rows against without rebuilding.

Tile coordinates below are `x, y` in tiles (the debug teleport's).

### plantOnWalk - 2914 (high: the owner's "AGAIN, 11-17")
**Finds:** a tree (not a street tree in its grate), shrub, bush, cactus or hedge (`hedgerun` along its whole run, `hedgebox`
over its whole box) on a SIDEWALK, ROAD, LOT or BRIDGE tile; on a PLAZA only for hedges and bushes in districts whose own
ground isn't paving (Midtown's and the Strip's block yards are plaza underfoot). By kind: shrub_a 577, palm_d 286, royal palms
238, tree_a 222, tree_b 191, bush_a 174, shrub_b 171, palm_a 163... - many are palms along the beach towns' promenade sidewalks
(Northshore Beaches, Pelican Key) and yard shrubs spilling a tile onto the pavement (West Hills 529, Midtown 315, Bayside 254).
The previous check (`plantOnPath`) only looked at a house's own path and drive, which is why the park-edge hedge got through.
**Fix:** find the placers (the yard dressing, the park edges' hedges, the beach towns' palms) and keep their footprints off
walkable tiles; a palm meant for a promenade gets a grate/planter (`grate: true`) like the street trees, or moves to the verge.
<!-- table:plantOnWalk -->

### planterOnWalk - 422 (medium)
**Finds:** planters (`planter_sq`, `planter_fl`, `planter_g`) and pots on a SIDEWALK, ROAD or LOT tile (on a plaza they're
its furniture). The owner's rule names planters; most of these are shop-front pots and sidewalk planters (Midtown 85, Neon
Strip 68, Westport Center 59), some on the road (e.g. 3263, 1679).
**Fix:** the owner decides whether a shop's pot against its wall is allowed (likely yes - then exempt pots within a tile of a
front wall); anything on a ROAD tile moves regardless.
<!-- table:planterOnWalk -->

### northDoor - 21 (high)
**Finds:** a business or public place whose entrance is on its building's north wall: a walk-in whose `walkIn.south` is
false, or (not a walk-in) every one of its places on the building's north half. Includes two casinos (Starfall Tower on The Strip, Wagon Wheel Casino in Old Downtown),
an urgent care (Yards Urgent Care), a gas station, coffee shops, a bait shop. Not counted: 1158 buildings of homes with their
lobby door on the north (`seen.northHomes` - the owner's rule names entrances in general; homes are the bigger pass).
**Fix:** flip the walk-in (its room's door row to the south wall), or swap the building with its south-facing neighbour in the
block; for a block whose only street is to the north, a SE/SW corner entrance.
<!-- table:northDoor -->

### interiorOverlap - 25 (high)
**Finds:** a walk-in's room (`walkIn` x0..x1, y0..y1) with another building's footprint in it (`bld` layer), or another
building's drawn front and roof (its section's box from its foot up its height, `buildingH`) standing over at least a tile by a
tile of the room's floor - the cut-away (`host.js cutBoxOf`) only opens the room's own building. Falls Center 9, Old Town 4.
**Note:** the owner's casino shot (entered from the north, a curtain of bistro lights in the alley above it) matches Wagon
Wheel Casino in Old Downtown (Lucky Mesa, 5271, 579): northDoor finds its walk-in facing north and festoonDensity's densest
cluster (11 runs) is right above it at 5271-5281, 576. interiorOverlap does NOT find a building over its room - look at it in the
game: if a facade covers it, it's drawn by something the row doesn't model (a tower part, a roof by another path).
**Fix:** shrink the room to its building's footprint, or let the cut-away open every building drawn over the room you're in.
<!-- table:interiorOverlap -->

### frontNames - 7 (medium)
**Finds:** a building's shop sign (or a name board on it) that names none of the places behind it and carries a trade word
belonging to another kind of place (CLINIC over a donut shop, MART over a pawn shop and a barber), or whose words name none of
its places at all ("FRAME & MAT" over the Arts District Clinic, "LOBSTER POT" over the Gull Harbor Clinic, "SUNBELT" over the
airport's First Aid). The Neon Nights case wasn't found by name - the Downtown/Midtown block in the note may be one of the
`lobbyDoor` fronts (a shop sign with no place of its own) - look at the clinics in the list first.
**Fix:** when a place takes over a building, its sign is the place's (world3-shops.js / the hand plans): the board from the
place's label, the old shop's words dropped.
<!-- table:frontNames -->

### lobbyDoor - 161 (high: the 24-7 Market)
**Finds:** an apartment's home place (its lobby door) on a building's south front under a shop sign: beside a business's
place on the same front, or on a front whose shop sign has no place of its own - a shop front you walk up to that says "Into
... Apt's lobby". Arts District 50, Midtown 39, Old Town 25.
**Fix:** move the home's door to the side or back wall (the owner's suggestion), or make the shop front a real place; a
decorative storefront with no place gets a closed shutter or "FOR LEASE" rather than a door.
<!-- table:lobbyDoor -->

### signCovered - 312 (medium; egret's row)
**Finds:** a prop's drawn pixels over a front's sign words (6 px or more), or a place's floating badge over them - a lamp,
an el's piers, a shelter, a stall's canopy, a phone booth, a porch's posts, a planter or a tree. (On this branch the window's
OPEN box isn't measured - `buildings.js openBox` is egret's.)
**Fix:** egret's class fixes (badges under the lintel, the ATM lower, signs clear) take it to 159; the rest by moving the props.
<!-- table:signCovered -->

### doorOnGrass - 1777 (medium; egret's row)
**Finds:** a business's or home's door whose step isn't on a path material (sidewalk, plaza, lot, dock, road, bridge, dirt)
or whose path doesn't reach a road within 400 steps. Mostly homes on lawns.
**Fix:** egret's `shared/world3-doorpaths.js` lays a path to every door it can (372 left on egret).
<!-- table:doorOnGrass -->

### wallOnly - 111 (medium; egret's row)
**Finds:** a place of a walk-in kind (`WALK_IN`, charter offices, hand plans' walk-in shops) with no room behind its door:
served at the wall. Many are World v3's hand-built town shops (Northshore Beaches 14, Willow Valley 12, West Hills 9).
**Fix:** egret's walk-in rooms for the long tail (17 left on egret).
<!-- table:wallOnly -->

### rampCrossesRoad - 9 (high: the owner's 20:20 shot)
**Finds:** a freeway ramp's level segment (`m.levels.segs`, `ramp: true`) below 0.9 of deck height over a ground-level road
that doesn't share a node with the ramp's own edge (not its junction): an embankment across the street.
Lake District 3 (the East Island Link and Gulf Loop ramps over Southside Drive and 17th Street), Northgate 3 (North Spur and Gulf Loop ramps over 1st Street and Bridge Avenue), Old Town 2 (over Ferry Street), and the West Loop over Sunset Bridge.
**Fix:** raise the ramp to a bridge over the street (deck height, pillars, its shadow on the road) or end it before the street
and join it at a junction.
<!-- table:rampCrossesRoad -->

### railOverWater - 110 (high: the owner's 20:28 shot)
**Finds:** a railing or fence run (`rail`, `crail`, `fenceline`, `yfence`, `chainfence`, `pierrail`, `creekrail`) with 16 px or
more of its span over WATER/DEEP (not dock or bridge). Liberty Bay 59 (the water district: rails along its
shores), Arts District 19, Neon Strip 15, Bayside 8 - the diagonal promenades.
**Fix:** a railing follows the edge it guards: a stepped / diagonal run on the land tiles along the shore (or a low sea wall).
<!-- table:railOverWater -->

### dockOverlap - 5 (medium: the Egret Marsh boardwalk)
**Finds:** two plank props (`boardwalk`, `pier`, footbridges) over each other away from their ends (one through the other), or
end to end at a bend with their ends crossed and no landing. All 5 are at Egret Marsh (997-1008, 2465-2489): four of the boardwalk's
bends (each leg runs 20 px past its corner - `world3-marsh.js` `len: L + 40`) and the boardwalk meeting the jetty (a `pier`).
**Fix:** a landing (a square deck) at each bend, legs cut to meet it; the jetty joining the landing. Note: the shore's docks are
DOCK tiles drawn by the bake, not props - their overlaps (if any) aren't measured here.
<!-- table:dockOverlap -->

### railOverWaterArt - 18 (medium: the owner's 21:28 shot)
**Finds:** each run of railway over water (the track's BRIDGE tiles with water beside them; one row per double-track span).
The page draws them as a deck with girder stripes (`client/render/trains.js:72,103`) - no piers into the water, no abutments,
no bridge shadow of a real structure; `RAIL_BRIDGE_ART` in worldrows.mjs is false until it does, so every span is a hit.
**Fix:** a rail bridge drawer (deck, ties, side girders or a truss / stone arches by setting, piers with a foam ring, the
shadow on the water, abutments), then set `RAIL_BRIDGE_ART` and the row reads the spans the art doesn't cover.
<!-- table:railOverWaterArt -->

### portalOnFlat - 16 (medium: the owner's 21:29 shot)
**Finds:** every open tunnel mouth (`m.tunnels`) where the ground over the bore (2-6 tiles in) is no higher in the relief
layer than in front of it: all 16 mouths of the 8 arrival-train tunnels (Greenfield Park, Northshore Beaches, Red Rock
Desert, Willow Valley stations - DIRT over the bore, relief rise 0). Road tunnels' portals are code-drawn "placeholder art"
(`client/tunnels.js:9`).
**Fix:** a hill / embankment over each tunnel (raised relief, cut walls, trees on top), a portal face with wing walls, the
train clipped to the mouth.
<!-- table:portalOnFlat -->

### festoonDensity - 9 (medium)
**Finds:** more than 8 runs of hanging lights within 8 tiles of one another (one row per 16-tile cell). Old Downtown 5, Neon
Strip 2, the Pink Mile 2. Tune `FESTOON_CAP` / `FESTOON_R` with the owner looking at a hit.
**Fix:** a cap per area in the festoon placer (`shared/world3-festoons.js`): a few runs crossing a space, not a curtain.
<!-- table:festoonDensity -->

### cropInTown - 49 (medium: the 16:15 shot)
**Finds:** a FIELD-tile patch, a crop strip, a vine row or an orchard in a district that isn't farmland (a town's or a city's
style) or within 6 tiles of a beach district's sand. Gull Harbor 33 (a beach town), Willow Valley 16 (farm fields reaching to within 6 tiles of a
beach district's sand). Many are 1-30 tile scraps - the "stray patch" class.
**Fix:** the countryside's fields only in their field zones; town lots and beachfront become a lot, a park or dunes.
<!-- table:cropInTown -->

### heliOffPad - 10 (medium)
**Finds:** a hospital with no ground helipad (`shared/flight.js airfields`: no clear spot within 600 px - Arts District Clinic,
Lucky Mesa General), or a ground pad whose round lies on a sidewalk / road / water / building (8 clinics' pads half on a
sidewalk). Also from the code: only the first hospital's yard gets an air ambulance (`server/systems/aircraft.js:105`
`hosp++ > 0`), and the charter job spawns its helicopter at a free spot up to 1400 px from the pad
(`server/systems/charter.js:66`) - off the pad.
**Fix:** a real helipad per hospital laid with the world (not a runtime search), clear of the pavement; the charter's
helicopter on the pad.
<!-- table:heliOffPad -->

### deadBoat - 103 (low-medium)
**Finds:** a boat prop (`rowboat`, `canoe`, `fishboat`, `sailboat`, `yacht`) not lifted on stands: canoes 35 (beached), moored
sailboats 27 and yachts 19 (Liberty Bay's marinas), rowboats 13, fishing boats 9. None is a vehicle.
**Fix:** a beached rowboat/canoe becomes a real vehicle (with the kayak's paddling, once built) or is clearly stored (upturned,
on a rack, `lift`); moored props stay scenery but out of swimming reach, or become marina vehicles.
<!-- table:deadBoat -->

### bigEmptyPlaza - 14 (medium)
**Finds:** a spot on PLAZA paving with no prop, solid thing, building or other ground within 10 tiles (an empty stretch 19+
tiles across, about half a screen). Downtown 4, West Hills 2, the airport 2.
**Fix:** the craft pass's rule: an open space gets a purpose and edges (planters, seating, a market, trees), or shrinks.
<!-- table:bigEmptyPlaza -->

### binBags - 44 (low)
**Finds:** black bin bags with no bin (trash can, dumpster, trash pile, burn barrel) within 3 tiles, outside the rough
districts (the 10-10 rule: "only a few, near cans or in rough alleys"). Midtown 21, Neon Strip 10.
**Fix:** the alley dressing places bags only beside a bin.
<!-- table:binBags -->

### drinkSign - 0 in the world
No world sign pairs drink with riding/driving. The one the owner saw is an interior sign line: "RIDE DRINK REPEAT" at
`shared/shoprooms.js:813` (biker bars 480 px wide or more) - replace it ("RIDE FREE", "LIVE TO RIDE"). The row stays at 0 to
keep it out of the world.

### The existing rows (for the record)
`parked` 124, `atmStray` 52 (allowed 53 - can come down by one), `beachWater` 4, `nameCovered` 1; every other existing row is 0.
<!-- table:parked -->
<!-- table:atmStray -->
