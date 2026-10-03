# Art spec: what final sprites must look like to drop straight in

The current build uses **sprites cut from your concept sheets** (`tools/extract_concept_art.py`) plus **procedural placeholders** (characters, tiles, buildings, flatbed, bus, armored van). Replace any of them by delivering art to this spec.

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

- Buildings are drawn as flat rooftops sized in whole tiles (shop 7×6, business 8×6–12×9, tower ~16×11), with the door on the south face. Rooftop AC units, signage and helipads are welcome.
- Ground tiles 32×32, seamless: asphalt (clean + worn), sidewalk with curb edges, brick plaza, parking lot, grass, sand, dock planks, dirt, field rows, water (3 animation frames), deep water, shoreline transitions.
