## 2026-10-24 - Batch 4f: the insides of buildings, each its own (the owner: "We should keep developing the interiors of buildings so they're more unique and interesting on the inside")

**What it was:** every walk-in that wasn't a food place, a hospital, a police station, the bowling alley, the cinema or
one of Midtown's six hand-fitted trades drew the same room: a grey counter and one shelf of random coloured goods along
the back wall. World v3 has 978 walk-in units; about 520 of them (the corner stores and marts, 312 of them, the clubs
and bars, the clothes shops, the gun shops, the banks...) looked exactly alike inside.

### The shops fitted by their trade (shared/shoprooms.js, new; client/art2/shopart.js, new)
- A plan per kind of place, laid out over the server's room (the counter row, the doorway and the floor don't move):
  - **corner store / mart** (convenience, the `mart` trade): aisles of snacks, a lit drinks cooler, the cigarette rack
    and the lotto behind the till, a hot-dog roller or the coffee, a slush machine, an ice chest, a newspaper rack or an
    arcade cabinet, a sign lit on the back wall (OPEN 24H, LOTTO, ICE COLD...); **gas station**: the same with the motor
    oil on its stand and a stack of tyres
  - **grocery**: aisles, produce bins by the door, the dairy coolers along the back, a freezer island, the carts
  - **liquor**: the back wall of bottles, a beer cooler, a wine rack
  - **gun shop**: rifles racked on the back wall, a glass counter of pistols on red felt, glass cases and a gun rack on
    the floor, ammo crates, a camo mannequin, a deer's head or a flag
  - **hardware**: the pegboard of tools, aisles, the paint cans, a stack of lumber, a ladder, a ride-on mower or a
    wheelbarrow on show, the key machine on the counter
  - **pawn shop**: guitars and TVs on the wall, jewellery under the glass counter, shelves of clutter and a heap of it,
    a big old safe, a bike, a jukebox (WE BUY GOLD); **the fence**: the same, darker, crates, no sign
  - **bank**: marble, the tellers' brass screen along the counter, the queue roped off with people in it, the vault door,
    the clock and the rates board, the loan officers' desks, an ATM, a runner from the door; **the courthouse**: its
    benches, the seal between two flags
  - **pharmacy**: pastel aisles of medicine, the green cross lit, the blood-pressure chair, a few seats
  - **barber**: the mirrors and the pole on the back wall, mirror stations with their chairs (a customer in one), the
    bench for the wait, a fish tank or the TV
  - **clothes / sports**: racks and folded tables, mannequins by the door; the sports shop's shoe wall, the ball bin and
    a bike
  - **tackle**: rods on the wall, a mounted fish, the bait tank, coolers, a canoe; **fish market**: ice tables, the ice
    in the counter, the lobster tank, the price board
  - **bars** (the `bar` trade) and the **clubs**: the counter a bar (dark top, the brass rail, the taps), the back wall of
    lit bottles, stools along the bar, a neon sign; the bars' booths, a pool table where there's room, a jukebox, a TV or
    an arcade machine; the clubs' dance floor lit in squares. The Rusty Spur keeps its own room, with the bar's back wall.
  - **offices** (the `lobby` trade: the opticians, insurance, tax, quick cash and travel shops along the main streets):
    desks with someone at them, filing cabinets, chairs to wait on, a water cooler - the optician's frames on the wall,
    the quick cash's grille, the travel agent's posters, an inn's key rack, armchairs and luggage cart.
- **Within a kind, every building its own** (seeded by where it stands: no Math.random, the same everywhere): the floor
  (lino, checkers in three colours, tile, planks, polished concrete, marble, carpet...), the walls (paint and its band,
  wood panelling, brick, pegboard, tile, stone), the goods' palette, the sign's words and colour, which hero pieces, and
  how the aisles fall. Forty corner stores in the test come out in over twenty looks.
- **Lit**: the coolers, the signs, the screens, the bottles, the dance floor and the fish tanks glow after dark
  (emissive pixels in the cut-away: statics.js zw takes the glow).
- **Gameplay-safe**: furniture isn't solid (as the food places' tables), and the door's lane, the strip along the counter
  (the place's spot) and an ATM the map stood in the room and its spot are kept clear; the bar's stools leave the spot
  you order at and the door free. Rooms with the door on the north side (none in World v3) keep the plain fit-out.
- **Customers** (server/systems/activities.js 'shoppers'): one to three in a shop when you come near - browsing an
  aisle, waiting at the counter, in the queue at the bank, sat in the barber's chair, on a stool at the bar, at a desk.
  The shopkeeper behind the counter was there already (interiors.js).

### The clinics' exam bays, the diners' colours, the homes' schemes
- The hospital and clinic lobbies (IN1-B) get exam bays out past the waiting chairs where there's room: a bed with its
  sheet and pillow, the curtain half round it on its rail (statics.js lobbyRoom).
- The diners' booths and checkers come in three colourings (red and black, teal and red, blue and teal), the fast-food
  places' counters with them (shared/foodrooms.js `v`, by the building).
- Homes (client/render/homeart2.js schemeOf): each home its own scheme by its id - the walls' paper tinted (sage, rose,
  blue, ochre or the plain one), the planks' wood, a house's siding. The plans (a trailer, a flat, a house, a mansion by
  the home's kind and its price) stay as they were, so every home's placed furniture stays where its owner put it, and
  a room the owner painted keeps its paint.

### Not done
- The arcade (another batch-4 slice) and Midtown's hand-fitted trades (laundromat, books, records, clothes, florist,
  salon) keep theirs. No hotel lobby or gym walk-ins exist to fit (World v3 has none); the `lobby` trade's offices took
  their place.
- The classic renderer (client/render/roomart.js) still draws the old fit-out for the shops.
- Furniture isn't solid: making it so means new solid props in the map (a world change).

### Budget
- **Raised: the bake worker's code, 860 -> 875 KB and 73 -> 75 files (now 874.8 KB).** The fit-outs are drawn where the
  cut-away rooms are baked - in the chunk bake, not the renderer - so shared/shoprooms.js (the plans, 8.8 KB) and
  client/art2/shopart.js (the painters, 9.1 KB) load with the bake worker; nothing of it is on the page (498) or in the
  renderer (400), which are untouched. Their comments were trimmed and three plans with no walk-ins in World v3 (a
  tattoo parlour, a gallery, a surf shop) dropped before raising it; the raise is the 15 KB the batch allowed.

### Tests
- test/shoprooms.test.js (new): each listed kind has its own plan and no two plans look the same; a building's fit-out
  is the same every time and buildings of a kind differ; in every size of room (3x3 to 24x10, the door left, middle or
  right) the door and the counter's spot stay in reach round everything that stands, nothing stands in the way or off
  the floor; the city's shops the same over the map's own tiles, their ATMs clear; the art draws every plan and the
  fit-out rides in the cut-away's recipe; customers stand on the floor; homes of a kind differ.
