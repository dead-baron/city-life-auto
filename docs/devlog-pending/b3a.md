## 2026-10-24 - Batch 3a of the owner's notes: cul-de-sacs by the highway, stray track, houses over houses, gardens in sight, long alleys

**Cul-de-sacs set back from the big roads** (the owner: "Weird intersection formation here with two cul-de-sacs touching
the major arterial road" - The Yards' Rail Street, cut either side of the Gulf Loop at grade, its two turning circles'
pavements on the highway's shoulders). World v3 only (today's world unchanged):
- shared/map.js clipAtHighways: a town street cut at a ground-level highway stops its turning circle's ring (rasterRoads'
  bulb, `bulbRing`) plus 3 tiles of verge short of the highway's edge (it stopped 3 tiles from the edge, the ring 2.6 tiles
  over it).
- shared/map.js setBulbsBack (after repairRoads' joins): any other town street's dead end whose ring would reach a bigger
  road (highway, ramp, avenue, boulevard, frontage, arterial, drive) is cut back along itself until 3 tiles of verge are
  left; a stub that can't clear it (a few tiles of road past a junction: Willow Road's 10 tiles north of North Coast Road,
  a carried-on line along it) is cut back to the junction, a T.
- Audit (tools: a probe over the built world, every node with a bulb against every bigger road within its ring + 1 tile):
  before 4 places (Rail Street x2 by the Gulf Loop, the Gulf Footbridge's end by the West Loop, Willow Road's stub on North
  Coast Road), after 0. Cedar Farms Road's end was set back too.

**No stray track** (the owner: "Random train tracks in this area, I don't think are supposed to be here?"). A loop came up
out of its tunnel for a short way and went straight back down: across Willow Valley's meadow between the Old Quarter's and
Old Town's tunnels (61 tiles, both ways), across the strip by Westport International (31 tiles, both ways), and the Pink
Line (one way) onto the Civic Bridge's road deck with its mouth out in Liberty Bay (45 tiles; the other way already ran
under the bay there). shared/world3-rail.js buryStubs, from world3-world.js' rails hook on the main line's and the subway's
loops: a surface stretch under 100 tiles between two tunnels, not within 70 tiles of a station, not the El's inclines or a
bore, and either dry all the way or with a mouth offshore (no dry ground within 2 tiles), stays below ground. The bridges
from shore to shore are kept (Liberty Bay's two, Old Town's). m.world3.railStubs lists them (5 stretches). The 'rails'
props were checked too: The Yards' freight sidings and its spur, the Arts District's Spur Line walk, the mines' and the
Copper Gulch crusher's - all deliberate, kept.

**Houses no longer stacked on roofs** (the owner: "The way some buildings overlap each other doesn't look very good"). The
block filler put a plain roof block (70%) in a row's back lot - behind every house shorter than its block, so the house's
roof was drawn over that block and the block's over the next row's fronts; in Mesa Flats north of Palm Row a whole block
90 tiles deep had roof blocks 80 tiles deep behind the fronts (the long dark "alley" of the notes is the lane between their
columns). shared/map.js fillerInner (World v3): a back lot behind a house in a houses, luxury or beach district is its
garden (grass, trees, shrubs). Mesa Flats gets Sage Street across its west block and Gold Street up to it
(shared/world3-mesa.js). Audit (each building's art v2 picture from statics.js staticIndex against the front walls of the
buildings behind it): a house's picture over a roof block behind it, more than 48 px: 327 -> 102 (the rest in the Old
Quarter and Southside, whose blocks are built up behind the houses); house over house 7 -> 3; anything over a house's
front 20 -> 17.

**Garden plots in sight** (the owner: "gardening spaces or other home features shouldn't be placed behind the home, they
should be out and easy to see and access"). server/systems/gardening.js findSpots: the bed was put as far from the door
as the lot went - the back yard, under the house's own picture (the camera looks north). Now it looks round the house's
whole yard (its lot, and open ground within 4 tiles nearer it than any other building, off the street's edge), leaves out
any spot with a building within 5 tiles south of it (behind a picture), and starts the bed at the nearest walk from the
door; a yard that is all behind a house (a terrace's back yards between two rows) gets the spot farthest out from behind
it. Nothing is added to the map. Before: 596 of 1771 houses had a garden, 1557 plots, 203 of them (13%) with a building
within 5 tiles south. After: 1642 of 1777 houses, 4871 plots, 438 (9%) - those in the 144 yards with no spot in sight at
all (Northgate's and Bayside Heights' back-to-back terraces, whose back yards lie under the next row's roofs), each at the
spot farthest out from behind it.

**Long alleys broken up and dressed** (the owner: "There are a few really long empty alleyways that could be broken up with
more side alleys connecting them and decorating them with more dressing"):
- shared/world3-hand.js K.row: a row backing onto a back alley (alley asphalt on most tiles just past its band) gets a
  passage through to it at least every 40 tiles (a 3-tile paved gap, the kit's 'passage'). Longest stretch of an alley with
  no way through to a street: Northgate's Allotment and Orchard Lanes 144/145 -> 46/44 tiles, Neon's Glow and Back Alleys
  106/113 -> 43/49, Midtown's Pier Alley 89 -> 39, the Pink Mile's Rose Alley 83 -> 42; the worst anywhere 145 -> 56
  (Midtown's two alleys between Madison Street and Civic Avenue, untouched: their rows don't back onto them).
- shared/map.js dressAlleys (World v3): more kinds against the walls - dumpsters of three colours, pallets of three, cable
  spools, pipes, planks, a steam vent, a hand truck of boxes; in the rough and low districts trash heaps, burn barrels,
  tyres, drums - and never more than 6 tiles of an alley without something. New art: client/art2/game/statics.js props
  'steamvent' and 'handtruck' (props-road.js' steamVent and handTruck models). The clutter guard keeps them on alley
  asphalt (world3-clutter.js ALLEY_DRESS).
- Not done: a parked van in the alleys (a car standing in a one-lane-each-way alley would block the traffic).

Homes: 304 of the 3486 home spots moved or were replaced (Mesa Flats' new rows, the houses districts' back gardens, the
alley passages); most home ids are renumbered. Tests: test/gardening, northgate2, pinkmile, world3clutter, worldbuild,
roadends, world3mesa (its count of Lucky Mesa's buildings now >= 90: 95, the roof blocks behind the flats' houses are
gardens), world3rail, world3roads, world3world, world3subway, perf, mapwindow, dmath.
