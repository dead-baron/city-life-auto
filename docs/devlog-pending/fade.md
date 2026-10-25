## 2026-10-24 - Hotfix: see-through buildings show what's behind them (cars, people, animals no longer vanish)

The owner, 10-24 (a phone shot): "With the current transparency in buildings vehicles and NPCs and things disappeared
entirely behind the building which isn't a good experience ... Still looking to have a subtle way to see behind
buildings that feels and looks good." In his shot a building between him and the street was faded - the ground showed
through it - but the pink car half under it was cut off at the building's edge and the people and cars behind the
faded part weren't drawn at all. Client only (the renderer): no server, shared or world changes.

### Why they vanished
The renderer draws into a G-buffer, which can't blend. A fading building's texel was the building's colour mixed
toward the street under it (the chunk's "under" layer), but it kept the building's height in the depth buffer - so
every sprite behind it (a car at 10 px, a person at 30) still lost the depth test to a roof at 100 px and wasn't drawn.
What showed was a picture of the empty street, painted on the roof. Only the dithered ring right round you took the
ground's depth, which is why the car was cut off along a line.

### What it does now (engine.js STATIC_FS, GHOST_FS)
- A fading building's texel takes the ground's depth (it keeps its own height and normal for the light and shadows),
  so whatever is behind it - vehicles, people, animals, bikes, carried crates, pickups - draws over it.
- A new pass after the sprites (GHOST_FS, one quad per chunk with a fading building, only where a sprite drew: depth
  GREATER than the ground) lays the ghost back over them, blended into albedo and emissive: half as much of it as
  over the street (`SEE` 0.5). At the 60 % ghost that's 20 % of the building over a car, so the car reads as a car
  seen through it, the street round it at 40 %. A car half under the building is one car, a little veiled where the
  building is - no cut at the wall line.
- It eases with the building (the veil over a sprite starts at the building's full colour and thins as it fades in,
  so nothing pops) and clears round you with the same feathered edge (`seenBehind` in JS, the tests).
- Once faded, the ghost casts no shadow (`F_NOCAST`, dithered in as it eases, so the shadow doesn't pop): before,
  its roof heights shadowed the ground round you (a dark dithered blob in the clear space - wider with b5a's feather)
  and would have shadowed the cars now showing under it.
- Unchanged: a building that isn't fading still hides what's behind it, and its footprint never fades (the inside
  stays hidden). Your own x-ray outline still shows you where you're hidden (behind a footprint, or before the fade
  starts); riders still get no outline.

### Ported from b5a (4a09a86e, the owner's notes part 2)
The see-through parts only: the clear space sized to the vehicle (64 px on foot, half the vehicle's length + 34 in
one, up to 130), the ghost at 60 % (thin ones 30 %), eased in 0.35 s and out 0.5 s through a smoothstep, the feathered
edge (`CLR_SOFT` 0.65) and the wide dithered hand-over of height (`CLR_SWAP`, `CLR_SWAP_W`); its comment trims in
engine.js and host.js too, which pay for the new pass (the renderer stays at 399 of 400 KB).

### Seen in the game
Midtown, standing on the pavement behind a block with its picture over the street (dev server, before = main's
renderer, after = this): before, a teal car cut off at the ghost's edge, a van cut at its side, the cars and people
behind it missing, a dark blob round you; after, a tow truck with a car on it and a van half under it whole, a taxi
and two workers behind it, the street through the ghost, no blob. Phone 390x844 and desktop 1440x900.

### Tests
- `test/seethrough-gl.test.js` (new): the engine in headless Chromium (SwiftShader) - a red block, a blue car behind
  it: drawn through the fading building at ~80 % (the ghost's share over it), hidden behind one that isn't fading and
  under its footprint. It fails on the old shader (the car came out as the ghost's colour).
- `test/seethrough.test.js`: b5a's easing, vehicle-sized clear space and feathering, plus `seenBehind`: what's behind
  shows at 75 %+ (more than the street does), nothing while it isn't fading, no step as it eases in or across the
  feathered edge.
