# Art inventory: what's in the game right now, and where it came from

Everything below is cut from (or painted to match) the concept art you shared. The build scripts
are re-runnable: `tools/build_art.py` (vehicles, props, building lots, ground textures, deck),
`tools/build_chars.py` (bodies, walk cycles, lying poses), `tools/build_interiors.py` (shop
interiors, outdoor scene paintings). Anything marked **procedural** is drawn by code in the
concept palette and is a placeholder until real art arrives (see `ART_NEEDS.md`).

## Buildings and lots (`assets/prefabs*.webp`, `shared/prefab-data.js`)

| Group | Lots | Source |
|---|---|---|
| Building sheet (upscaled) | house1-3, apt1-2, tower1-2, hotel, hospital, police, fire, gas, conv, strip mall, market, rest1-2, club, bank, dealer, repair, warehouse, industrial, construction, church, school, park | building concept sheet |
| Whole scene lots (a building with its own yard, lot, driveway) | fuel (FuelMax), clubnova, clubeclipse, police2, police3, motors (Riverside Motors), trail (Trail & Field), boutique, quickstop, apt3, apt4, house4, house5, house6, bank2, junkyard, tackle2, shack, farmstead, site (construction), beachbar, pool | the scene paintings, one lot each |
| Night glow per lot | every lot above | derived from the day art |
| Rooftop modules (AC, helipad, tanks, skylight, hatch) | stamped on procedural roofs | style-guide roof tiles |

## Interiors (`assets/interiors.webp`) - new this round

Walk into any of these and the roof lifts off onto the painted interior (mirrored for shops that face north):

| Business kinds | Painting |
|---|---|
| convenience | the corner liquor store, or the 24-hour corner store |
| gasstation | the FuelMart shop |
| grocery | the FreshMart supermarket |
| pawn, fence | the pawn shop |
| clothing | the boutique |
| sports, hardware, gunshop, tackle | Trail & Field outfitters |
| bank, courthouse | the Liberty Bank hall |
| hospital, pharmacy | the City General lobby |
| police | the station floor (lockers, interview rooms, cells, briefing) |
| coffee, fishmarket | procedural fit-out (no painting yet) |

The police station lobby / armory screens shown while you use the front desk are still **procedural**.

## Outdoor scene paintings (`assets/scenes.webp`) - new this round

- **Cedar Hills Golf Club** - the whole golf course painting (clubhouse, carts, fairways, bunkers, ponds, creek) laid over open countryside on Cedar Isle; the clubhouse is solid.

## Ground (`assets/ground.png`)

asphalt, worn asphalt, concrete sidewalk, red brick, slate plaza, water, deep water (style-guide and waterfront sheets); grass, sand, dirt (generated in the concept palette); the elevated-highway deck (the night-highway painting's asphalt).

## Vehicles (`assets/atlas0.png`)

compact, sedan, taxi, sports, pickup, van, police, swat, ambulance, bike, speedboat, dinghy, bus, armored, flatbed, box truck, dump truck, mixer, tanker, garbage truck, fire truck, tow truck - several painted variants each, from the vehicle sheets. **Procedural:** police motorcycle livery, police boat livery, jetski, trains (locomotive, coaches, mail car).

## Characters (`assets/chars/`)

- Body sheet: male and female idle + female walk frames from the character sheets; the male walk is composed at runtime from the female walk legs. Clothing, hair and skin are recoloured layers (outline / skin / shirt / pants / shoes / hair).
- Lying poses (knocked down, passed out) from the "lying down" sheet.
- **Procedural:** running, punching, throwing, aiming, diving, swimming, animals.

## Street props (`assets/atlas0.png`)

~70 props from the street-props sheet: trees, palms, shrubs, benches, hydrants, dumpsters, planters, fountain, umbrellas, vending machines, pallets, drums, tyres, cones, news boxes, mailboxes, lamps, crates (4 tiers), loot bags (4 kinds), produce.

## Railway (all procedural, in the concept palette)

Track, ties, bridge decks and girders, level crossings (gates, lights, crossbucks), open-air platforms (deck, coping, safety line, shelters, benches, lamps, name boards, stairs), platform clocks, the boarding glow, the trains.

## Concepts not used yet (candidates for later rounds)

- Train coach interior (seats, standees, doors) - for the riding view of the coaches.
- Central Station / elevated station / metro station buildings - a grand station building beside a platform.
- Riverside Mall with its car park; the airport terminal; the soccer stadium and park soccer field (both have painted players, need clean versions); beach boardwalks; the tropical island; desert canyon road; neon strip blocks; the night club interior (no walk-in clubs yet).
- Character part sheets (bodies in 8 directions, hair/hat/top/bottom/shoe overlays) - the base for a full layered character system once animation frames exist.
