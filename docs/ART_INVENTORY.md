# Art inventory: what's in the game right now, and where it came from

Everything below is cut from (or painted to match) the concept art you shared. The build scripts
are re-runnable: `tools/build_art.py` (vehicles, props, building lots, ground textures, deck),
`tools/build_chars.py` (bodies, walk cycles, lying poses), `tools/build_interiors.py` (shop
interiors, outdoor scene paintings). Anything marked **procedural** is drawn by code in the
concept palette and is a placeholder until real art arrives (see `ART_NEEDS.md`).

## Buildings and lots (`assets/prefabs*.webp`, `shared/prefab-data.js`)

Every lot faces south, front at the bottom. Scene lots are cut so the painted door sill sits on the footprint's bottom edge (`SCENE_DOORS`), and painted people are removed (`NPC_PAINT`); check them with `tools/preview_lots.py`. The FreshMart front (`market`) and the scene construction site (`site`) were retired in round 8c for their painted crowds.

| Group | Lots | Source |
|---|---|---|
| Building sheet (upscaled - still a bit soft) | apt1-2, fire, gas, strip mall, club, dealer, repair, industrial, construction, church, school, park | building concept sheet |
| Redrawn from the scene paintings (round 7, crisp) | house1-3 + house7-9 (suburb painting), conv + rest1 (intersection paintings), rest2 + diner (railway-crossing street), hotel + royale (luxury boulevard), bank + vellori + monarch (financial district), warehouse (back-alley warehouses), tower1-2 (overpass blocks), police (police HQ), market (FreshMart), shanty1-3 (the shanty street), arcade / tattoo (the neon strip; neonclub, neontap, midnight, luna, latebite and bistro were retired in round 8 for their painted crowds), crown / greenbistro / theatre / diamond / redawning (the boulevard row) | the scene paintings |
| Hospital | concept roofing tiled over the roof, the rainy-night hospital front, helipad and plant from the roof sheet | composed by `make_hospital()` |
| Whole scene lots (a building with its own yard, lot, driveway) | fuel (FuelMax), clubnova, clubeclipse, police2, police3, motors (Riverside Motors), trail (Trail & Field), boutique, quickstop, apt3, apt4, house4, house5, house6, bank2, junkyard, tackle2, shack, farmstead, site (construction), beachbar, pool, **liquor** (liquor store with the garage and flats above - a walk-in convenience store with the liquor-store interior) | the scene paintings, one lot each |
| Storefront rows (one walk-in business behind each door) | **shops1**: Joe's Burgers, Riverside Books, Pixel Tech, Thread & Co., Brew Haven (Westport Center, Northshore); **shops2**: Pizza, 24/7 Mart, Bean There coffee, Urban Wear, Pharmacy (Falls Center, Old Quarter) | the two high-street paintings |
| Night glow per lot | every lot above | derived from the day art |
| Rooftop modules (AC, helipad, tanks, skylight, hatch) | stamped on procedural roofs | style-guide roof tiles |

## Interiors (`assets/interiors.webp`) - new this round

Walk into any of these and the roof lifts off onto the painted interior. Every painted person has been removed (`NPC_PAINT` in `tools/build_interiors.py`); the game's own clerks stand behind the counters:

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
| club | the nightclub (bar, dance floor, VIP booths, cloakroom) |
| police front desk / armory screens | cut from the station painting |
| coffee, fishmarket | procedural fit-out (no painting yet) |


## Outdoor scene paintings (`assets/scenes.webp`) - new this round

- **Cedar Hills Golf Club** - the whole golf course painting (clubhouse, carts, fairways, bunkers, ponds, creek) laid over open countryside on Cedar Isle; the clubhouse is solid.
- **Paradise Cay** - the palm-island painting raised out of the bay between Westport and Metro City: the land, beaches and jetty follow the painting exactly (sampled into a tile mask), the cabin is solid. Boat-only.
- **Red Rock Canyon** - the desert canyon painting in the Dry Creek desert: the mesas and cliffs are solid where they're painted, plus the homestead and water tower.

## Hand-designed blocks (`assets/blocks*.webp`, `shared/block-data.js`, `shared/handblocks.js`) - new this round

The neighbourhood around Broadway where Midtown, Northgate and Downtown meet (tiles x 693-863, y 477-551), repainted by you over a spectator screenshot and rebuilt from the paintings by `tools/build_blocks.py`. There are 18 blocks: Fresh Coat Garage, Bean Machine Coffee, South Port Cannery, Vellori + Downtown Station, The Daily Fork (replacing J&R Salvage), FreshHub Grocery, MediMart Pharmacy, Falls Hardware, City General, Cedar Falls Clinic, Fitness + Midtown Station, Books, Electronics, Metro City PD - HQ with its gated motor pool, City Hall, and the three Broadway corner gardens.
- Each block is cropped at its painted curb and fitted to the game's block curb to curb. It's scaled evenly, and seam carving takes up the remaining difference so signs and lamps keep their shape. The Broadway gardens are two triangles, each warped onto the game's triangle.
- Road tiles are cut out of the art, so the game's own streets, crosswalks and traffic signals show.
- The painted subway entrances are painted out; the game's working kiosk stands there instead.
- Signs say the game's names: FRESHHUB GROCERY, MEDIMART PHARMACY, FALLS HARDWARE.
- Night: the painting's own lit windows, signs and lamp heads glow, and every painted lamp found in the art is a real light that throws a pool of light and is solid. Other painted furniture (trees, benches, bins, planters) is flat art you can walk over.
- Sources: `6798e892`, `390d1fba`, `cb2ec2d4`, `c98ce2f5`, `ecf8162e` (the `Westpoint General` hospital painting was not used: City General was picked).

## Subway entrances (`prop_subway_l`, `prop_subway_r`)

The two street kiosks from the subway concept (green railings, stairs, SUBWAY sign, globe lamps), cut out of the pavement around them (`SUBWAY_ART` in `tools/build_art.py`), drawn 128 px wide on each underground stop's plaza. The real-world route bullets on the signs are blanked; the game draws its own City Loop badge (orange L) there. The queue lane, countdown board and boarding glow are drawn in code.

## Cash machines (`assets/atlas*.png`, `prop_atm_*`)

16 ATM units from the ATM concept sheet: blue, red, green, gold, grey, BANK, 24/7, canopy, leaf, neon, hood, recess, CASH, wood, frame, plus the freestanding kiosk. Each is cut tight to its housing (`ATM_ART` in `tools/build_art.py`) so it stands against any building front. The units with real-world branding and the drive-through are not used.

## Animals (`assets/animals.png`, `tools/build_animals.py`)

Lost pets: two top-down dogs (golden, black), two spaniels, a retriever and three cats (black, grey, ginger) cut from the character sheets. Each has idle, walk (4), run (4) and sit frames. These are **placeholders generated from the single concept pose**: paws swing under the top-down dogs, and the sitting 3/4 views stand up and step. Birds are still **procedural**.

## Ground (`assets/ground.png`)

asphalt, worn asphalt, concrete sidewalk, red brick, slate plaza, water, deep water (style-guide and waterfront sheets); grass, sand, dirt (generated in the concept palette); the elevated-highway deck (the night-highway painting's asphalt).

## Vehicles (`assets/atlas0.png`)

compact, sedan, taxi, sports, pickup, van, police, swat, ambulance, bike, speedboat, dinghy, bus, armored, flatbed, box truck, dump truck, mixer, tanker, garbage truck, fire truck, tow truck - several painted variants each, from the vehicle sheets. **Procedural:** police motorcycle livery, police boat livery, jetski, city bicycle, trains (locomotive, coaches, mail car).

## Characters (`assets/chars/`)

- Body sheet: male and female idle + female walk frames from the character sheets; the male walk is composed at runtime from the female walk legs. Clothing, hair and skin are recoloured layers (outline / skin / shirt / pants / shoes / hair).
- Lying poses (knocked down, passed out) from the "lying down" sheet.
- **Procedural:** running, punching, throwing, aiming, swimming, animals. Dive rolls, tumbles and flings reuse the drawn lying-down body (curled up for a roll). Bike and jet-ski riders are the drawn upper body on the saddle.

## Street props (`assets/atlas0.png`)

Painted ground shadows were cut out of 45 props by `tools/deshadow.py` (run it after `tools/build_art.py`); the game casts their shadows from the live sun instead.

~70 props from the street-props sheet: trees, palms, shrubs, benches, hydrants, dumpsters, planters, fountain, umbrellas, vending machines, pallets, drums, tyres, cones, news boxes, mailboxes, lamps, crates (4 tiers), loot bags (4 kinds), produce.

## Code-drawn street furniture and country props (`client/render/newprops.js`, `client/render/country.js`)

Pixel art drawn in code in the concept art's 3/4 style (top-left light, dark outlines) and registered in the sprite atlas, so smashing (pieces of the sprite fly off) and the spectator view treat them like concept-sheet props:
- Town: bus shelters, phone boxes, bollards, alley crates, ground AC units, bin-bag piles, billboards with six made-up adverts.
- Country: dome tents (3 colours), fire pits, picnic tables, wooden utility poles (wires drawn live between them), lattice radio masts, wind turbines, pump jacks, oil tanks, a flare stack, solar panels, the drive-in screen, speaker posts and marquee, the observatory, coin binoculars, runway lights.
- Animated live: turbine blades, pump-jack beams and cranks, flames, red aircraft beacons, the film on the drive-in screen, the marquee's chaser bulbs.
- Painted into the ground: the quarry's terraced pit and the raceway oval (kerbs, start line).

## Railway (all procedural, in the concept palette)

Track, ties, bridge decks and girders, level crossings (gates, lights, crossbucks), open-air platforms (deck, coping, safety line, shelters, benches, lamps, name boards, stairs), platform clocks, the boarding glow, the trains, the coach interior, subway stairways, tunnel portals and cuttings, the underground tunnel view.

## Streets and water (all procedural)

Smooth road and rail bridge decks along the road's curve; zebra crossings; mast-arm signal poles (and knocked-over poles); span-wire signals; bridge toll gantries; spike strips; waterfront boathouses (catwalks, pilings, tin roof); rental-dock kiosks and piers; country-station car parks.

## Concepts not used yet (candidates for later rounds)

- Central Station / elevated station / metro station buildings - a grand station building beside a platform.
- Riverside Mall with its car park; the airport terminal; the Syndicate's purple gang compound (for the gang HQs); the neon strip and luxury boulevard street scenes; the marina; the canal and river bridges; the soccer stadium and park soccer field (both have painted players, need clean versions); beach boardwalks; the tropical island; desert canyon road; neon strip blocks; the night club interior (no walk-in clubs yet).
- Character part sheets (bodies in 8 directions, hair/hat/top/bottom/shoe overlays) - the base for a full layered character system once animation frames exist.
