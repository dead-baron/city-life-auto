## 2026-10-25 - Batch 6b: the caves' own art and light, the falls and cliffs by hand, the salmon going up

The owner's notes, part 2: "caves are still placeholder art inside ... dark inside for sure but there should be some
natural light ... lanterns hung up or bioluminescent plants/fungi/creatures, or light shining through the ceiling ... areas
that are completely dark ... a lantern or low level flashlight ... kind of rare"; "random looking rock columns doesn't look
great ... the waterfalls themselves across the world aren't all perfectly rectangular ... salmon ... make it up the
waterfall and make it to the next pool".

### The caves (the mines' caves and the Redwood Caverns)
- **Art** (new client/underground/caveart.js, loaded with the cave view - nothing of it on the page or in the renderer):
  each 512 px tile of a cave is painted pixel by pixel at 2 px a pixel. The walls' outline is worn round (the cells'
  edges with noise in them, ±10 px; the physics still walks the cells). The rock's top is dark and mottled. The south
  faces stand up 26 px in layered strata with ledge lines, cracks, flowstone streaks, drip teeth under the rim, dark and
  glistening by the water, with roots and moss hanging in where the chambers are shallow. The floor is mottled and
  shadowed at the walls' feet, with rubble and pebbles thicker toward the walls, puddles, cracks, the den's moss, the
  sea cave's cobbles, and grass and ferns where daylight comes down. The water is deep and dark in the middle and
  pebbled and clear at its edge. Each cave has its own stone: a mine's grey granite, a cavern's brown basalt, a crystal
  chamber's blue-violet, the sea cave's black. The things in it are drawn new: stalagmites with growth rings and drip
  pools (a stalactite hangs over the tall ones), glowing mushrooms with glow ferns round them, glow-worms' beaded
  threads, faceted crystal clusters, lanterns (on posts, or hung from iron brackets on the walls), the miners' timber
  sets (posts, cap beam, braces). A cave tile now takes ~25 ms to paint, so after the first four the view paints one a
  frame.
- **Light** (shared/caverns.js `lightCave`, run on every cave once its dressing is done; the server and the view both
  load it):
  - **Shafts of daylight** come down through the roof (`K.shafts`): in a mine's river hall and onto its still pool, and in
    a cavern's gallery, great lake and stalactite hall. In the view each is a leaning beam in the sky's colour, with
    dust turning in it and a pool of light on the floor. By night only a little moonlight comes down (`SHAFT` in
    shared/underground.js; `lightAt` counts them).
  - **Lanterns hung on the walls**: a mine's along its way in, in its hall and along the passages off it. A cavern's go
    along the paths in from its mouths, in the gallery, lake, stalactite hall, sea cave and treasure chamber, and at
    the foot of its stairs. These are in addition to the docks' lanterns.
  - **Timber sets** across a mine's way in and its first passages (`K.timbers`), and the ore face's passage in a cavern.
  - **The dark** is everything else: a mine's den, its glow-worm and crystal caves (lit only by their own glow), and the
    passages between. In a cavern: the echo hall, the den, the ore face, and the river's long reaches between docks. On
    the test mine about 33% of the floor is lit by day without a light of your own, and 45% is pitch dark.
- **The rare find** (`CAVE_FIND` in shared/rules.js; server/systems/underground.js `rollFind` / `takeFind`). Each time you
  go into a cave there is a 12% chance that an old lantern or flashlight lies at one of its lit spots (`K.finds`: dry
  floor in a shaft's pool or by a lantern, away from the way in). You get a light you don't own yet if there is one.
  The find is yours alone and goes when you leave. The view draws it lying there with a glint now and then ('ug'
  message: `find`). "Pick up the old lantern lying here" puts it in the bag at 35% batteries. If you already own both,
  you take a set of batteries. Dev: `{c:'ug', k:'cave', shaft: n, find: 'here'}`.

### The falls and the cliffs (all of them: client/art2/water.js `fallModel`, `cliffWall`, `caveMouth`)
- **Layered rock** (`rockKit`) replaces the columnar basalt everywhere: beds of stone in courses, a dark seam under each
  bed, a light lip along its top, each bed's own tone, cracks. On top there is moss with ferns standing out of it, roots
  hang down the faces, and the rock is dark and glistening wet by the water.
- **A fall's walls** stand to its lip beside the water and step down in ledges away from it into the ground. A low
  ledge runs along their foot in places, mossy boulders sit at the foot, and rocks break the water above the lip.
  The six stray columns in front of every fall are gone.
- **Not rectangular**:
  - The lip's edge wanders (±4 px) and so does the water's back.
  - The banks above the lip jut in and out.
  - Every fall over 34 px is split into strands of different widths with rock between (as the ledge falls already
    were). Each strand is thrown out its own way. The glassy tongue over the lip has a ragged edge, there are thin
    places where the dark wet rock shows through, and the edge of the churn at the foot is ragged.
  - The small curtains (props-wild.js `waterfall`) got ragged edges, an uneven brink, and a rock splitting the top.
  - The ledge falls' pieces (Twin Falls, Long Ledge Falls and the rest) no longer stand in one ruled row: each sits a
    little forward or back of the next (±7 px) and a little higher or lower (±4 px of drop).
  - The cave view's puddles are smaller and its cracks rarer, and the shafts' beams have soft edges.
- **The cliffs**: a cliff steps back in ledges as it rises, and its ends come down into the ground. The end by a fall
  is wet (`cliffWall`'s new `wet`).
- **Set into the land**: a falls' gorge walls (Redwood Creek's; Willow River's) are drawn on toward the falls until they
  meet the falls' own rock (statics.js `fallWalls`). Redwood Creek's fall has 56 px of rock either side
  (`FALLS_LOOK.creek.rock`), so the cliff runs unbroken past the cave mouth and the falls. The escarpment the relief
  raises at each falls (world3-relief.js) is unchanged, and the walls now read as its face.
- **The water round them** (client/art2/game/waterlife.js, which loads lazily and is outside the budgets): rings break
  all over the plunge pool, and its churned foam spreads off downstream in the current (`flowAt`).

### The salmon going up (waterlife.js `CLIMB`)
40% of a salmon's leaps at a falls now make it. `_above` finds the water above the falls (24-150 px past its drop). The
salmon arcs up the face over the curtain: it stays at the foot for depth-sorting, and is raised by the height it
climbs.
It lands in the water above with a ring and a splash, and swims on upstream for 6-11 s. Then it is gone, and the next
one turns up in the pool below. The rest fall back into the pool as before.

### Budgets
- The bake budget goes 875 -> 878 KB (877.2 measured). The cause is the layered rock and the falls' irregular water in
  water.js, plus the small curtains and the walls' meeting. The columns' code (`basaltShade`, the column map) was
  taken out first.
- The renderer and the page are unchanged: page 498 KB, renderer 400 KB. The caves' art loads with the cave view, and
  the salmon, ripples and churn are in waterlife.js, which loads lazily.

### Tests
- New **test/fallart.test.js**: a fall's lip wanders, its water comes over in strands of different widths, its walls
  stand to the lip by the water and step down away from it, and a cliff has ledges and its ends come down.
- **test/cavelight.test.js**: a cave has lit stretches and dark ones. The shafts light the floor by day, with only a
  little moonlight at night. The den is pitch dark. The finds lie on dry floor in the light, and the layout is
  deterministic.
- **test/underground.test.js**:
  - The rare find: about 12% of visits, a lantern or a flashlight at a lit spot, gone when you leave. It is picked up
    into the bag on low batteries, or as batteries if you own both.
  - "Pitch dark with no light" now looks for a chamber that nothing lights.
- **test/world3caves.test.js**: the cavern's shafts and hung lanterns, lit and dark stretches, and finds in the light.
- **test/waterlife.test.js**: salmon make it up the face into the water above the falls and swim on upstream.
- Run under the lock after stamping: world3server, world3world, world3woods, world3rivers, world3peaks, nature, biolum
  and waterbake, 69/69. world3caves, underground, cavelight, waterlife, fallart, fallscenter, cedarfalls, ledges and
  fishing, 38/38. After the last tweaks: world3rapids, world3rivers, world3relief, waterbake, nature, art2, dmath,
  mapwindow, fallart, cavelight and world3caves, 91/91, and perf 6/6. Also wind 8/8, which checks that the new rock's
  ferns and roots hold still with the rock.
