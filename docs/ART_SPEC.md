# Art spec: what final sprites must look like to drop straight in

The current build is assembled from your concept sheets by `tools/build_art.py`:

| Asset | Source sheet | Output |
|---|---|---|
| 27 building lots (houses, apartments, towers, hotel, hospital, police, fire, gas, shops, strip mall, supermarket, restaurants, club, bank, dealership, auto repair, warehouse, industrial, construction, church, school, park) | building sheet, upscaled 4x with Real-ESRGAN (`tools/sr_upscale.py`, a numpy port that needs no torch) then stored at 1 art px per world px | `assets/prefabs0.webp`, `prefabs1.webp` + generated `shared/prefab-data.js` (footprints, doors) |
| 5 rooftop equipment modules (AC unit, helipad, tanks, skylight, roof access) stamped onto procedural flat roofs | style-guide roof tiles | `assets/atlas0.png` (`prop_roof_*`) |
| grass, sand, dirt (seamless, generated in the concept palette) | `tools/build_art.py` | `assets/ground.png` |
| asphalt, worn asphalt, concrete sidewalk, red brick, slate plaza, water, deep water | style-guide tile sheets, waterfront sheet | `assets/ground.png` (seamless 128 px) |
| ~70 street props (trees, palms, benches, hydrants, dumpsters, planters, fountain, umbrellas, vending, pallets...) | street props sheet | `assets/atlas0.png` |
| 14 vehicle models (drawn at the art's own proportions; the collision box is the sprite) | vehicle sheets | `assets/atlas0.png` |

Characters are hand-authored 24x24 pixel art painted in code (`client/render/peds.js`, 3-tone shading + dark outline like the concept sheets, outfits layered from the server's appearance record); preview every archetype and pose at `/tools/character-preview.html`. Still procedural: crop fields, lamps, flatbed truck, and the filler rooftops (parapet, tar/gravel/metal/glass/terracotta surfaces) that pack the dense GTA-style blocks. Re-run after adding or changing sheets:
`python3 tools/build_art.py <folder with the concept PNGs>`. The building upscaler needs `tools/weights/realesr-general-x4v3.pth` (download from github.com/xinntao/Real-ESRGAN releases v0.2.5.0; BSD-3). Without it the build falls back to Lanczos + sharpen. Replace any of them by delivering art to this spec.

## Camera and scale

- Straight top-down (90°) for tiles, roofs, vehicles and props. Characters may keep the slight-tilt "see the face" look from your sheets.
- 1 world pixel ≈ 4.5 cm. **Tile = 32 px.** Roads are 4 tiles wide (one 64 px lane each way).
- Deliver at **2× world size** (the atlas is 2 px per world px) on a transparent background.
- Palette: the 16-colour reference from the *Universal Texture Reference* sheet; ≤ 256 colours per atlas (we quantize).

## Vehicles: one image per model, **front pointing RIGHT**

| Model id | World size L×W | Deliver at | Cargo slots (forward, right offsets in world px) |
|---|---|---|---|
| bike | 48×20 | 96×40 | (-18, 0) |
| compact | 84×44 | 168×88 | (-4, 0) |
| sedan / taxi / police | 100×48 | 200×96 | sedan (-8, 0) |
| sports | 96×48 | 192×96 | — |
| pickup | 110×50 | 220×100 | (-18,±12), (-40,±12): **empty bed** |
| van / ambulance | 112–116×54 | 224–232×108 | van (-14, 0) |
| armored | 118×56 | 236×112 | — |
| swat | 120×58 | 240×116 | — |
| flatbed | 150×56 | 300×112 | (2,±13), (-24,±13), (-50,±13): **empty deck** |
| bus | 190×60 | 380×120 | — |
| speedboat / dinghy | 104×48 / 80×40 | 2× | boat (-24,±10) / dinghy (-20,0) |

- **Beds and decks must be empty.** Crates are separate sprites placed into the slots by the game.
- Colour variety: either several painted variants per model (current approach) or one grey body + a paint mask.
- Needed per model later: damaged state; headlight / brake-light / siren overlays (currently drawn by code).
- No real brands or agencies (USPS, UPS, FedEx, DHL, Amazon, Brinks, Garda, FBI…). Use in-world names: *ParcelPig, SwiftBox, IronVault Armored, Metro City PD*.

## Characters

- Frame **48×48 world px** (96×96 delivered), character ~40 px tall, facing **RIGHT** in the base frame.
- 8 directions: draw **E, NE, N, SE, S**; W/NW/SW are mirrored.
- Layers, bottom → top: base body (with underwear) → bottoms → shoes → top → hair → headwear → held item. Grey-scale garments are tinted in-game.
- Animations and frame counts: walk 8 (loop), run 8 (loop), carry-walk 8 (loop), idle 4, punch 6, throw 6, pistol aim 2 + recoil, hit 4, death 6 ending on the passed-out pose, dive roll 4.
- Not baked in: crates, guns, car doors, blood, bottles (separate sprites/effects).
- Two base bodies at launch (male/female average build).

## Crates, bags and icons

- World crate ~26 px (52 delivered); closed versions only in-world. Open versions are for UI.
- Tiers: 1 wood, 2 reinforced/steel, 3 military/iron, 4 carbon-gold. Loot bags: duffel, tactical pack, security case, gold lockbox.
- Weapon icons: 64×32, transparent, side view.

## Map

- Buildings are whole lots drawn at 2 world px per sheet px (e.g. a 120x230 px house lot = 7x14 tiles), entrance at the bottom; the generator rotates back-row lots 180°. New lots: add the crop box, footprint fractions and door positions to `PREFABS` in `tools/build_art.py`.
- (older guidance) Buildings are drawn as flat rooftops sized in whole tiles (shop 7×6, business 8×6–12×9, tower ~16×11), with the door on the south face. Rooftop AC units, signage and helipads are welcome.
- Ground tiles 32×32, seamless: asphalt (clean + worn), sidewalk with curb edges, brick plaza, parking lot, grass, sand, dock planks, dirt, field rows, water (3 animation frames), deep water, shoreline transitions.
