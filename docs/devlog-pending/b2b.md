## 2026-10-23 · Owner's notes, batch b2b: tracks and pavements clear of scrub, farmed fields, upright town palms, hospital canopies over the doors, readable picture neon, the sea's sparkle

The owner's 10-23 notes on the World v3 map (the PDF's pages 5, 8-10 and 14-17):
- **Dirt roads and pavements** ("dirt trails getting a lot of vegetation growing on it", "full flowers and bushes coming
  out of the sidewalk doesn't look right"). The wild's scrub, cacti and trees were laid before the tracks (Willow Valley,
  the desert, the ridge: world3-biomes.js dress3), and the renderer's ground cover grew on any dirt tile. Now the clutter
  guard (shared/world3-clutter.js) takes every tree, palm, shrub, bush, flower and cactus off a ground-level dirt road's
  bed (the tiles it lays as dirt: DIRT_BED) and off the pavements out in the country (WILD_STYLES); the ground cover
  (client/art2/game/statics.js coverItems, trackClear) grows nothing on a dirt road's bed and only a low tuft of grass
  now and then along its edges (the new `weed` / `dryTuft` species). A shrub or a flower on a town's pavement or plaza is
  drawn in a planter (a topiary in its pot, a flower box, tulips or daffodils - plantFor); at the rough end of town a
  tuft of grass up through the cracks; the desert towns' agave and cactus beds and a farmyard's lavender stay.
- **Fields** ("crop fields or orchard fields or flower fields are overgrown with other types of vegetation"). Willow
  Valley's orchards and lavender and sunflower rows are recorded on the map (m.orchards: the ground each row's run of
  plants stands on, rows that run alike joined - world3-biomes.js; Windrush
  Farm's orchard in world3-gullharbor.js) and, with the nature sites' orchard and vineyard (their landmarks), the art
  keeps the wild flowers and scrub out of them (a grass tuft now and then at the edge) and gives them farmed ground:
  an orchard's floor mown in stripes (ground.js orchardGrass, groundbake.js ORCHARD), tilled furrows under the lavender,
  the sunflowers and the vines (soilPlowed). (The crop fields' own tiles grew none already.)
- **Palms** ("so many crooked palm trees in the city"). A coconut or a leaning palm in town - a median, a row, a plaza, a
  garden - is drawn as `cocoUp` (flora.js cityCoconut: upright, a slight lean either way by the tree); on the sand,
  out in the wild or within four tiles of the sea a palm still leans and curves.
- **Hospitals** ("hospital entrances not lining up with overhang"). The red-H entrance canopy was put at the end of the
  front away from the doors; now it stands over the doorway (slid up to 20 px to clear a street lamp), on every hospital
  drawn from the hospital prefab (Old Town Infirmary, Northshore Medical Center, Southbank Medical, Westside Clinic,
  Westport General, Cedar Falls Clinic, Sandpiper Bay Clinic, Lucky Mesa General, Northshore Medical). St. Neon
  General keeps its own glass canopy over its doors and the red-H one over its ambulance bay.
- **Picture neon** ("neon tiger sign is way blown out, can't see details"). The sign's own light hung 18 px in front of
  its middle at 2.6 - it lit the tiger's orange two and a half times over and the bloom did the rest. The picture signs
  (neonsigns.js paintPic: the tigers, the eye-patch woman, the Pink Mile's and the Arts District's pictures, the
  saguaro) are now glass (the point lights reach them a third as much), their tubes glow bright and their fills dimly
  (PIC_TUBE / PIC_FILL), their halo on the wall is softer, and their light stands out over the pavement below them (44 px
  out, at 0.7 of the sign's height, 1.5): the stripes, the eyes and the outlines read.
- **Fences and scarecrows in the street.** Checked on today's build: no field fence run, hay bale or scarecrow the
  renderer draws stands on a road, a pavement, a bridge or the water (the 10-22 guard's field.fence / bales / crow), and
  no map prop fence, post or scarecrow outside the handcrafted plans' own dressing stands on a road or a pavement. What
  was left were the hand plans' own runs, which the guard leaves be: the promenades' seawall railings carried on across
  the road where it bridges the water (the Pink Mile, Neon Strip, the Harbor, Bayside's), hedges and yard fences laid
  over a roadway (Bayside Heights, The Yards). Now a hand plan's railing, hedge, yard or lot fence (no solid along it)
  that crosses a roadway (not one along its kerb) is cut back to its longest stretch off it, or goes when that's under
  24 px (world3-clutter.js cutHandRuns) - Willow Valley's and Neon Strip's waterfront railings no longer run across the
  roads down to the water. (Left as they are: The Yards' and
  Bayside Heights' fences and hedges laid along a kerb on its roadway's edge tiles, and the police motor pools' chain-link
  down a pavement's edge beside their lots in three towns - along the street, not across it.)
- **The water's "rapid lines"** on large waters. The sea's surface in the light pass (lightgame.js waterSurf) was three
  swells at fixed angles: their glints fell in a regular lattice of white marks marching diagonally over a whole bay.
  Now its swells are lower, a slow noise bends their crests out of line, and the sun catches them in patches - a
  sparkle here and there. Rivers 36 tiles wide or more and a river's last stretch to the sea (water.js WIDE_STILL,
  MOUTH_UP) take the still water's wind waves instead of the running water's flecks; their current shows in the bake.

Tests: test/world3clutter.test.js - nothing grows on a dirt road's bed nor on a pavement in the country, a shrub at the
track's edge and the street trees in town stay; a hand plan's railing across a street is cut back to its stretch off the
roadway, one wholly on it goes, one clear of it is as it was.
