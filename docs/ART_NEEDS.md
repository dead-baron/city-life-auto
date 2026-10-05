# Art needed from you

This is the running list of art the game still fakes with placeholders. When you're ready, ask for
"all the sprite sheets" and you'll get a sheet-by-sheet brief (grid, frame size, order, palette).
Sizes and conventions follow `ART_SPEC.md`: top-down, tile = 32 world px, deliver at 2x on a
transparent background, vehicles facing RIGHT, no real brands.

## 1. Characters (highest priority - the most visible placeholders)

One sheet per base body (male, female), 96x96 frames, 8 directions (draw E, NE, N, SE, S; W/NW/SW are mirrored), with clothing as separate overlay layers (grey-scale garments are tinted in-game):

| Animation | Frames | Loop |
|---|---|---|
| idle | 4 | yes |
| walk | 8 | yes |
| run / sprint | 8 | yes |
| carry-walk (crate held in front) | 8 | yes |
| punch | 6 | no |
| throw | 6 | no |
| pistol aim + recoil | 2 + 2 | no |
| rifle / shotgun aim + recoil | 2 + 2 | no |
| hit reaction | 4 | no |
| dive roll | 4 | no |
| knocked down -> get up | 6 | no |
| death (ending on passed-out) | 6 | no |
| swim | 6 | yes |
| sit (train seats, benches) | 1 | - |
| enter / exit car (door side) | 4 | no |

Overlay layers needed for each frame: hair (several styles), headwear (cap, beanie, police cap, helmet, cowboy hat), tops (tee, hoodie, jacket, suit, uniform, vest), bottoms (jeans, shorts, skirt, uniform), shoes. Also: cops, SWAT, EMS, mail guards, gang colours as outfit sets.

## 2. Vehicles

- Damaged / wrecked state for every model (burnt shell).
- Light overlays: headlights, brake lights, reverse lights, police/ambulance/fire light bars (2 frames each).
- Doors-open frames (left/right) for the enter/exit animation.
- Police motorcycle, police boat, jetski, a proper dinghy with outboard - currently recoloured or procedural.
- City bicycle (40x14 world px, facing right; a few frame colours) - procedural now.
- Flat-tyre look (shredded tyres after a spike strip) - optional overlay.
- Trains: locomotive, passenger coach, mail car - roof views at 196x70 / 212x76 / 188x76 world px, plus coach and mail-car interiors with no painted people (the coach interior is drawn by code again).
- Optional: a light aircraft and an airliner for the airports (static props now).

## 3. Railway

- Track tiles: straight, curves (gentle), on ballast and on a bridge deck; a steel truss bridge span.
- Level crossing kit: gate arm (up/down), post with crossbuck and lights (lit/unlit), road panel.
- Station platform kit: platform edge with safety line, shelter, bench, lamp, name board, stairs/ramp, ticket machine; a station building (small town + big city versions).
- Subway: a sidewalk stairway entrance with its sign (top-down), a tunnel portal / cutting with retaining walls, and a tunnel interior strip for the underground view.
- Small country-station car park (a few bays, a shelter) - procedural now.

## 4. Buildings

- More whole-lot paintings in the current style for each district type (each one: building + its yard/lot, drawn so the front faces the street at the bottom): suburban houses x4, apartment blocks x3, office towers x3, strip mall, mall with car park, motel, diner, fast food, cinema, arcade, car wash, gym, laundromat, church, school, library, fire station, warehouse/industrial x3, farm buildings (barn, silo, farmhouse), desert shacks/ranch, beach houses, lighthouse.
- Interior paintings for walk-in businesses still on the plain fit-out: coffee shop (now in both storefront rows), fish market, pharmacy (currently reuses the hospital lobby), courthouse (reuses the bank hall), gun shop (reuses the outfitter), hardware store. Same layout as the existing ones: back wall + counter at the top, shop floor in the middle, glass front + door at the bottom.
- The remaining building-sheet lots are still upscaled and soft: apartment blocks x2, fire station, gas station, strip mall, dealership, repair shop, factory, building site, church, school, park. Whole-lot paintings of these would replace the last blurry ones.
- **No people painted into lots or interiors.** Only real NPCs should show. Rounds 8 and 8c painted the figures out of every lot, interior and scene in use. Eight lots whose crowds couldn't be removed cleanly were retired: Neon Tap, Luna Lounge, The Midnight (rooftop party), Club Neon / Dance Drink Repeat, Late Bite, Le Petit Bistro (the full patio), the FreshMart front (its cutaway shop floor is full of shoppers) and the scene-painted construction site (workers everywhere). Clean repaints of those, with nobody on the pavement, at the doors, in the windows or on the floor, would bring them back. Please draw future lots, interiors and scenes empty of people.
- Every lot faces south (front at the bottom), so north-facing versions are no longer needed. A painted door's sill should sit right at the bottom of the facade: the game puts its doorway there.
- Night versions are generated automatically; no need to draw them.

- **More hand-designed neighbourhoods** (the round 11 workflow): spectator mode → screenshot + schematic of an area → paint over it → send it back. Paint one block per image at least ~1000 px square for the sharpest result (the downtown close-ups were ~550-650 px a block, a little soft once fitted). Keep each block's curb and corners, the same building positions as the schematic, and nobody painted on the pavement. Leave the subway entrance and traffic signals out (the game draws its own working ones).
- **A street-furniture sheet** in the downtown painting's style, each object alone on a transparent or flat background, about 150-250 px per object: the black double-globe street lamp, three or four street trees (round, cherry blossom, conifer, palm), blue bus shelter, bench, trash can, planter box, bollard, newspaper box, mailbox, hydrant, chalkboard sign, café table with umbrella, the green "Downtown →" sign, a stretch of black iron fence and its gate, the red-and-white barrier arm. The game could then place them anywhere in the city as real objects (solid, knocked over by cars, lit at night) instead of only inside the painted blocks.

## 5. Environment

- Clean versions (no painted people) of: soccer pitch / stadium, beach volleyball court, park playground - painted people can't move, so the live ones are drawn on top.
- Airport kit: terminal building, jet bridge, hangar, apron markings, runway ends.
- Water kit: shoreline edges and corners (sand, rock, concrete quay), piers, buoys, boat wake.
- Boathouse for waterfront homes: a covered boat slip about 64x128 world px, roof view, plus a roof-off version (the roof fades while a boat is inside).
- Boat-rental kiosk (a small shack with a "Rentals" sign, about 96x64) and hire boats tied along a pier.
- Smooth bridge decks: straight and curved road / rail bridge spans with railings (drawn by code along the road's curve now).
- Pets: the same dogs and cats walking, running and sitting (4-frame trot, 4-frame run, a sit; top-down or side-on). The current frames are placeholders generated from the single concept pose of each. A few more strays too.
- Weather/FX: rain streaks, puddle splash, tyre smoke, skid marks, muzzle flashes, explosions (6-8 frames), fire (loop), blood decals.

## 6. Street furniture

- Traffic signals: a mast-arm pole with its 3-lamp head (top-down, lit and unlit), its knocked-over state, and a span-wire head hanging from cables (for downtown).
- Bridge toll gantry spanning a road, with cameras.
- Police spike strip lying across a road.

## 7. UI

- Weapon icons (64x32 side view) for every weapon tier, including pepper spray and the spike strip; item icons (bandage, med kit, armour, fishing rod, fish types).
- HUD frame pieces (minimap ring, wanted stars, money font) if you want them hand-drawn.
