## 2026-10-24 - Batch 3b: a place to wake up in every region, the spawn map, fences you can't walk through

### Somewhere to wake up in every part of the world (the owner: "a clinic or hospital to spawn at spread around the world ... one for each district/region")
The audit (World v3 built as the server builds it; each district's land, sampled, against the 13 hospitals and clinics
you could wake up at): whole regions were 500-1,500 m from any - the islands (Gull Harbor 1,225 m from the nearest,
Coral Cay 1,064, Pelican Key 795, Paradise Cay 1,477), the Egret Coast (1,068; Egret Point 1,285), the Granite Peaks
(957), Highland Woods' far west (1,470 at its edge), the desert east of Copper Gulch (to 1,185) and Dusty Hollow (574),
the Sandpiper Coast (649, its north-east 1,069), Westport International (641), Southside (702), the city's north and
east (Midtown 573, Northgate 543, The Yards 619, the Stadium District 635) and the Arts District (614). And the
generator's "Northshore Medical" - planned for Northshore, which builds its own Medical Center by hand - had landed in
Copper Gulch, next door to the town's clinic.
- shared/world3-medics.js (new, the whole-world build only): `clinics3` (map.js calls it just before the walk-ins are
  built) turns a storefront nearest a spot into a clinic in nine built-up places - Northgate Clinic, Yards Urgent Care,
  Arts District Clinic, Southside Community Clinic, Pelican Key Clinic, Gull Harbor Clinic, Westport International First
  Aid, West Hills Clinic, Northshore Beaches Clinic - each a walk-in with its ER reception like the towns' clinics
  (a plain storefront before a named one; never a church, a hotel, a warehouse, a stadium, a bar); `POSTS3` (built by
  shared/world3-shops.js with the wild land's themed places) puts a small building by the road nearest its spot where
  there's no town: Egret Point Clinic, the Egret Marsh, Pine Gulch, Highland, Granite Peaks and Summit Road ranger
  stations, the Red Rock, Eastern Desert and Sandpiper Junction first-aid posts - and on Coral Cay, built up to its
  beaches, a lifeguard tower by Tiki Point with the first-aid post at its foot. All are kind 'hospital': respawn points
  (homes.js spawnOptions), the ambulance's and the helicopters' hospitals as before. DROP_SPECIALS3: the stray Northshore
  Medical isn't placed.
- After: 31 places to wake up (was 13); every district's middle within 600 m of one (the worst: the Bluffs 450 m, North
  Point 444; Coral Cay 2 m, Gull Harbor 168, the Egret Coast 365, the Granite Peaks 86, Red Rock 316, the Sandpiper Coast
  260). Prison Island (a prison) and the scattered islets have none. test/world3server.test.js checks it.

### The spawn map (the owner: "Still hoping to get a spawn point map when you are choosing a place to spawn")
- The death screen (client/deathscreen.js, still loaded the first time you go down; the map's renderer client/worldmap.js
  loaded with it): with the choices, a card with the world map - every place you can wake up marked (hospitals red,
  clinics and first-aid posts blue, ranger stations green, your homes), the one picked ringed in yellow with its name,
  the nearest to where you went down tagged and pulsing, you where you fell - and a strip of the places nearest first
  with their distances. Click or tap a mark or a name to pick it; the arrow keys / the D-pad step to the next one that
  way on the map; drag to look round, the wheel or a pinch to zoom; ✕ folds the map away (the 🗺 by the spot brings it
  back) and folding the choices (Esc / B) takes it with them. It opens on where you went down and the few places
  nearest it. Docked top right on a desktop and a landscape phone, across the top in portrait.
- The server sends where each place is (homes.js spawnOptions: x, y; the hospitals nearest you first) and where you went
  down (me.deadAt). README: the controls row.

### Fences you can't walk through, and the hop over the low ones (the owner: "an auto-jump over mechanic ... on things like fences (specifically this mid-height wooden fence)")
- shared/fences.js (new): every fence run - the fence props (fenceline: picket, wood, rail, iron, stone, chain;
  chainfence, yfence, hedgerun, rail) and the fields' split-rail fences - is a segment people collide with
  (shared/physics.js pedStep, registered by the server - server/world.js - and by the page once it has the city, so the
  page's first load doesn't carry it). Low and mid-height ones (rail, picket, board, iron, low stone, hedges under 16 px)
  you hop: run into one square on (the stick past a walk, the keys, a dive roll) and you crouch a beat (0.12 s) and
  vault it, up 12 px through it and down on the far side (0.5 s in all) - not carrying a crate, not on a board, not
  swimming, and only where there's ground to land on (no wall, water, solid prop or second fence there). Walking into
  it holds you. Chain-link, walls and tall hedges always block. The others see the hop (a 'hop' event; the page lifts the
  person through it: client/main.js pedLook); your own is predicted (its time left rides in the self record's spare
  slot). The people the server walks hop the low ones the same way when they walk into one; a tall one stops them.
  Cars drive through them as before. Not yet solid: the fences only the renderer lays (a house's front fence or hedge
  drawn with its lot, the police motor pools' chain-link, a compound's walls are tiles already) - they have gaps at the
  paths by design but no collision.
- shared/world3-fencegaps.js (new, World v3's done hook, last): no fence shuts a door, a yard's gate or a path. From
  every door near a fence (314) the street must be reachable on foot past the fences - none was shut in - and a fence
  across a narrow path (pavement, paving, dirt, boards with other ground either side along the fence) gets a 48 px gap
  where it crosses: 74 gaps (44 picket, 9 field fences, 8 chain-link panels, 4 wood, 4 chain-link, 3 hedges, 2 railings)
  - most of them the ends of yard fences that ran out across the pavement (North Point, West Hills, Cedar Falls, The
  Yards' trailer park).
- test/fences.test.js: held walking, hopped at a run (the crouch, the lift, the far side), the event, chain-link holds,
  a crate holds, a wall behind it holds, the page's prediction matches.
- Page code: 497.9 KB of the 498 budget (the fences load after the page; the spawn map with the death screen).
