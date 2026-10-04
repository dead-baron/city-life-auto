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
- Trains: locomotive, passenger coach, mail car - roof view AND interior view (seats, aisle, doors), at 196x70 / 212x76 / 188x76 world px. The coach-interior concept can be cut down for this if you don't redraw it.
- Optional: a light aircraft and an airliner for the airports (static props now).

## 3. Railway

- Track tiles: straight, curves (gentle), on ballast and on a bridge deck; a steel truss bridge span.
- Level crossing kit: gate arm (up/down), post with crossbuck and lights (lit/unlit), road panel.
- Station platform kit: platform edge with safety line, shelter, bench, lamp, name board, stairs/ramp, ticket machine; a station building (small town + big city versions).

## 4. Buildings

- More whole-lot paintings in the current style for each district type (each one: building + its yard/lot, drawn so the front faces the street at the bottom): suburban houses x4, apartment blocks x3, office towers x3, strip mall, mall with car park, motel, diner, fast food, cinema, arcade, car wash, gym, laundromat, church, school, library, fire station, warehouse/industrial x3, farm buildings (barn, silo, farmhouse), desert shacks/ranch, beach houses, lighthouse.
- Interior paintings for walk-in businesses still on the plain fit-out: coffee shop, fish market, pharmacy (currently reuses the hospital lobby), courthouse (reuses the bank hall), gun shop (reuses the outfitter), hardware store. Same layout as the existing ones: back wall + counter at the top, shop floor in the middle, glass front + door at the bottom.
- Police station lobby (front desk) and armory full-screen interiors (currently procedural).
- Night versions are generated automatically; no need to draw them.

## 5. Environment

- Clean versions (no painted people) of: soccer pitch / stadium, beach volleyball court, park playground - painted people can't move, so the live ones are drawn on top.
- Airport kit: terminal building, jet bridge, hangar, apron markings, runway ends.
- Water kit: shoreline edges and corners (sand, rock, concrete quay), piers, buoys, boat wake.
- Weather/FX: rain streaks, puddle splash, tyre smoke, skid marks, muzzle flashes, explosions (6-8 frames), fire (loop), blood decals.

## 6. UI

- Weapon icons (64x32 side view) for every weapon tier; item icons (bandage, med kit, armour, fishing rod, fish types).
- HUD frame pieces (minimap ring, wanted stars, money font) if you want them hand-drawn.
