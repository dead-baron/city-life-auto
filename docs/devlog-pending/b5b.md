## 2026-10-24 - b5b: the owner's notes, part 2 - the world's layout (crossings, footbridges, back lots, odd dead ends, doors, signs and street trees, bus stops, street parking)

The owner's second set of notes (the page renders with his screenshots) had eight things about how World v3 is laid
out. Where each screenshot is: the crossings over grass and the club's door are on Neon Boulevard by Club Ultraviolet
(the Neon Strip); the palms in front of the signs are the Neon Strip's north pavement (Laser Karaoke, Moondog); the
bus stop is the shelter on that pavement; the footbridge with the platform under it is Redwood Creek's in Highland
Woods, below the falls by Highland Road's stone bridge; the car park on the roof is a back block's lot with a row of
buildings laid over its middle (Quick Stop's strip in the Lake District / Falls Center, Southside's and the Old
Quarter's back blocks); the odd road is a street's dead end with its turning circle jammed against the next street.

### Crossings painted over grass (shared/roadcore.js, client/art2/game/groundbake.js)
- A zebra across a boulevard ran straight over its planted median: the median is drawn on the boulevard's asphalt,
  so the stripes went over the grass. Each crossing now knows its refuge (`ref`: the median and its kerbs, half
  width); across it the bake lays a paved strip of concrete slabs through the planting - a pedestrian refuge - and the
  stripes stop at the kerbs either side. Every boulevard with a median (Neon Boulevard, Midtown Boulevard, the Pink
  Mile, Ocean Drive, Mesa Road, the 14 px medians of the avenues-as-boulevards).

### Footbridges with a wooden platform under them (shared/naturesites.js, world3-downtown.js, world3-midtown.js)
- Redwood Creek's footbridge stood on a 3 x 2 rectangle of dock planks laid square to the map under its slanting deck:
  the "platform". The planks were how the old builder made a crossing walkable. Now it's bridge tiles under the deck,
  as the trails' and the ledge falls' footbridges already were: walked onto from the bank you're on the deck, swum in
  under it you stay in the water (shared/physics.js `under`), the water drawn under it. The same for the Pine Lake
  trail's footbridge, the park creek's timber and stone arch footbridges, Downtown park's two arch bridges and
  Midtown pond's arch bridge, which all stood on plank decks.

### Car parks on a building's roof (shared/map.js)
- A back block (reached only from the north) got a car park from the filler, then a row of roofed buildings laid over
  its middle three rows in: the bays (4 deep) ran onto the roof, the second row of bays and their parked cars were
  under it. Now (World v3) a back block's car park stays one open lot unless the block is deep enough for the
  buildings to stand behind its row of bays and an aisle (`LOT_FRONT`, 8 rows) - and then they're one storey, their
  roofs not drawn up over the bays (the owner's "lower the building below it"); the bays a building covers go, with
  their cars. The same for a split block's two corner buildings. 745 of 5265 bays were under a roof; none now.

### The odd dead end (shared/map.js)
- The class: a street's dead end whose turning circle overlapped another street - a stub a few tiles long off a street
  with its bulb lying over that street (Northshore Beaches' Shell Street), or two streets ending side by side, their
  circles overlapping (the Stadium District's 3rd Street and Gameday Drive). setBulbsBack only kept the circles clear
  of the big roads. Now two town streets' dead ends within 14 tiles of each other, neither pointing away from the other
  and nothing between, are joined into one street (`joinDeadEnds`: a jog where they were offset); and every side
  street's turning circle keeps a tile of verge to any other street's asphalt (three to a big road's, as before), cut
  back along itself - a stub that can't is cut back to its junction. A hand plan's streets stay as drawn: a street
  meeting one of their dead ends is carried on to it (the Stadium District's case: 3rd Street now runs on into
  Gameday Drive with a jog, one street where there were two turning circles). Bulbs crowding a road: 5 -> 2 (Summit
  Road's by a dirt trail, Shell Street's a tile and a third from Dune Street).

### Doors (shared/map.js buildInteriors) - about twenty walk-ins' doors were wrong, none now
- A walk-in's doorway always went in the south wall (its prefab drawn facing south) - but a hand plan's building that
  faces north has its door, its POI and its front on the north (face 'N': the Old Town's Pescheria del Molo, Il Faro,
  Galleria San Marco, Merletti Anna, Old Quay Bait & Tackle, the Yards' Urgent Care, the Stadium District's Gas 'n
  Go): the walk-in's door was in its back wall. And some fronts opened straight onto the next building (the Arts
  District's row on 2452: Teal Coffee, Moth Laundromat, Linden Cafe, Moth Donuts, Slate Bakery; Olive & Oil; Spezie &
  Sale) or into a yard no street reaches (Ramen Studio, Falls Center's Corner Deli). Now (World v3, `walkInSouth`) the
  door goes on the side the building's own door is; a front whose doorway would open onto a building or into a yard
  with no walk to a street (`walkReach`: 160 steps) gives way to the other side, and the walk-in, its POI's outside
  spot and b.door go with it (a hand building turned to the north has its plain back drawn to the south); and along
  the front the doorway sits where the ground outside is walkable (Olive & Oil, Spezie & Sale: their sign's column
  opened onto the next building, a passage a tile along didn't).

### Signs behind trees, palms everywhere (shared/world3-greens.js, new)
- The palms on the city's pavements and plazas become the district's own street trees and planters (`PALETTE`): plane
  trees, ginkgos, maples, flowering trees, cherries and magnolias, cypress and olive in the rich districts, flower,
  box and green planters - with a share of palms kept (a third on the Neon Strip, half on the Pink Mile, a tenth
  downtown). Palms stay on the beaches, in the desert towns (Lucky Mesa's Strip), by the sea and down the boulevards'
  medians (Neon Boulevard's royal palms with their lights).
- A tree on the pavement in front of a storefront's sign (within 6 tiles of the facade, its crown over the sign's
  span) moves along the pavement to the nearest gap - the end of a front, or between two signs - clear of the doors
  and the other furniture, its strung lights following it; with no gap within 8 tiles it gives way to a low planter
  (the lights strung to it come down). A front 12 tiles wide or less counts as all sign (the art lays its lettering
  and neon where the door leaves room, near enough the whole width), a wider one its lettering's width and a tile.
  `signsBlocked(m)` is the check: 317 trees stood in front of signs (Neon Strip 52, Midtown 50, Downtown 44...); none
  now - 186 moved to a gap, 146 lowered to planters. Of 463 palms on the pavements 98 kept.

### Bus stops (client/art2/props-district.js, server/systems/transit.js, client/render/busboard.js)
- The shelter: a navy canopy with a lit white fascia, glass back and side, the bench and the advert panel - and past
  its end the stop's pole with a round blue BUS sign and an arrivals board.
- The board is live: the server sends every shelter's next bus about once a second (`bt`: the shelter's prop, the
  seconds, the line; `stopBoards`), the page counts down between (as it does the platform clocks) and draws the
  board on the pole - the line's colour, NEXT BUS, "3 MIN", "DUE" in flashing green as it comes in, "--" with no bus
  out. Loaded only once the first board message comes (render/busboard.js).

### Street parking (shared/world3-kerbs.js, new)
- About half the plain two-way side streets of the city's houses, apartment, old town and Southside districts - West
  Hills, Pine Hills, Cedar Falls, the Old Quarter, Old Town, Northgate, North Point, Southside (whole streets, by name;
  not the small towns, whose lots are laid tight to their streets: Timber Bend's clinic lost its lot) are laid 8 tiles
  wide with a 44 px parking lane by each kerb - the traffic lane inside as wide as a normal street's - its line and
  bays painted. Never an avenue, a boulevard, an arterial, a one-way street or a hand plan's.
- A bay every 150 px along them, each a kerb parking spot (traffic.js parks a car in most, when nothing is passing):
  none within 4 tiles of a junction box or a turning circle, 5 of a zebra, 2.5 of a hydrant, 6 of a bus stop, 3.5 of a
  driveway or a garage, on a bend, a bridge or beside a cut in the pavement.

### Tests
test/world3server.test.js: crossings only on the asphalt (a refuge across every median); no plank deck under any
footbridge, bridge tiles under them, Redwood Creek's walked over and swum under; every walk-in's door on its
building's door side, a doorway opening onto walkable ground with a walk to a street; no tree in front of a sign and
the Neon Strip's pavements more than palms; no parking bay under a building; the street parking's bays on the
asphalt, clear of the junctions, crossings, hydrants and bus stops, the traffic lane clear.
