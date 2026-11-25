# The art pass - things for the owner to check (kept since 2026-11-24)

Project copy: `claude/art-check-list.md`. The owner, 11-24 14:35: "Keep a list of things to check and I will check them
when we push everything live" - the art collects on branch `fable-art-1124` and goes live in large batches. Each line:
where to look, what changed, what to judge. "Picture" names what was sent in the chat when it was made. Lines are
added as the work goes; a line he has checked is marked with his word and the date, not removed.

**Judge from the pictures before the batch goes live** (baked in - changing one afterwards is another re-bake, ~5 h):
- [x] **The sea is a deeper blue offshore.** (The owner, 11-24 14:37: "I think the new sea looks fine.") A shelf of clear shallows along a sandy beach, then deep; the wide
  turquoise that reached far out is gone with the dark and azure blocks. Picture: `report-4-sea-blocks`. If he wants
  the wide turquoise back: two numbers (water.js FAR0 / FAR1).

- [ ] **The redwoods stood apart.** 2,915 of 16,546 redwoods (18%) taken out from right behind another's trunk, so
  trunks read one by one and more floor shows. Picture: `report-10-redwoods` - the change is modest. Judge: keep it;
  and whether the deep grove should open further, which would mean more high crowns there (his 11-21 call was high
  crowns over paths, creeks and roads, a mix deeper in).

- [x] **"The lake a perfect oval"** (his note of 11-23): answered 11-24 18:13 - Mirage Lake, the one in the
  cinematics.
- [x] **Mirage Lake's new shore** (the owner, 11-24 21:40: "The lake looks better like this so this would be
  acceptable"). An offshoot cove on its west side added at his suggestion: picture `report-27-mirage-cove`. Judge
  the cove: keep, smaller, or out. Its cinematics are reshot at the end of the art pass.
- [x] **The plants' dark undersides - superseded** (his word of 11-25 03:29: redrawn from the source instead; see
  the end of this list). What was built first, on his word of 11-25 00:04, was variant F: Every plant kind: leaves lit
  evenly, no leaf tone under the style anchor's dark green. Pictures: `report-34` (the creek, before and after, at
  the game's pixel). Judge in the game: enough, or a step lighter (`flora.js` `LEAF_LOOK`); the trunks' and cacti's
  shaded sides, which were left.
- [ ] **The banks** - any wild river, creek or lake: grown over and going under the water in tongues, an earth lip
  (about a fifth), shingle or a dirt bar by turns; stones along the banks, fewer in the water. Pictures:
  `report-32`, `report-34`. Judge: the mix; whether the damp band reads as bank or as a smear.
- [x] **The bake's code budget** (the owner, 11-25 03:05: "Yes raise the bake code limit as you need": 1,100 KB; at
  1,089 with the fern kit). It stood at 1,080 of 1,080 KB. The fern kit (about 6 KB), the shade floor and a stick
  bridge need room: raise it (to 1,100?) or say what to trim.
- [x] **The sample creek: is this the creek the redwoods should have many of?** (The owner, 11-25 09:03, on
  `report-39`: "Creek looks good let's go with it" - the network is laid, see below.) Fernwater Creek, laid by rule down
  the land from the woods west of the Giants Loop to the lake (283 tiles; riffles, 7 pools, stepping stones where a
  path crosses). Pictures: `report-20-creek`. Judge: its width, how many boulders, the pools (big enough to read as
  pools, to fish), the stones. On his word the same rule lays a network, with ponds in the hollows.
- [x] **The summits** (the owner, 11-25 11:57: "This looks good"; built 11-25 on his word "Build the summit from plans") - Eagle Knob (the Summit Trail's end,
  the telescope), Windy Col, Cairn Peak: a rock top with a level shelf, a crag wall either side of stone steps.
  Pictures: `report-46` (before and after), `report-47`. Judge: does it read as a top; the steps' width; whether
  Cairn Peak - on a spur at 106 m, not a mountain top - should move or be renamed.
- [x] **The high mountains show their slopes** (the owner, 11-25 11:57: "This looks good"; found 11-25: over 255 m the land was flat to the art - 23.2% of
  Granite Peaks). Picture: `report-49` (before and after on the steepest ground). Judge: the ledges' closeness on
  steep rock (`groundbake.js` `LEDGE.step`), the shade (`LEDGE.shade` 0.64, was 0.55 everywhere).
- [x] **The creek network** (the owner, 11-25 11:57: "This looks good"; laid 11-25 on his word "Creek looks good let's go with it") - eight creeks in Highland
  Woods; two join others, three end in ponds. Picture: `report-48`. Judge: how many; the ponds' size (about 9 by 7
  tiles). A car driven into a creek is in the water, as in a river.
- [ ] **The mountains' streams** (11-25; his note: "water chunks that blend into the mountainous area above and
  foothills below") - Granite Peaks had one tarn and no running water; six streams now run from the high scree to
  the sea, the rivers and the woods below, one under a road. Pictures: `report-50`, `report-51` (after his notes of
  13:33: the headwalls gone, the road over the creek a bridge with a rail each side; streams run on into the water
  they reach). Judge: how many; whether the road over the creek reads as a bridge or wants a stronger deck. Summit
  Tarn: he said yes to changing it (13:33) - a wall of rock behind it and its outflow's cascade are not built.
- [x] **The El and the highway decks see-through**: off (the owner, 11-25 09:03).
- [x] **The fern kit: which kinds, and is this the look.** (The owner, 11-25 03:05: "Fern looks good to me", the
  gold bracken sparingly - planted 11-25.) Nine kinds drawn, none planted yet: sword, an old
  tussock, lady, maidenhair, bracken (green and gold), deer, chain, fiddleheads, licorice. Pictures: `report-21`
  (the sheet, four shapes a kind, beside today's three) and `report-22` (a mock-up of a bed: today's ferns, the
  kit's). Judge: any kind to drop or redraw (the bracken and the licorice fern are the weakest); how much gold.
- [x] **The giant redwoods' tops: pick one.** (The owner, 11-25 03:20: "a mix of all three (A and both J column and
  J ragged)" - in.) The trunks-only look was rejected on sight (11-24 18:47). Forms of the
  same tree shown since, none in the code: A as now; B crown carried high; C a small crown higher still; D smaller
  again (`report-13`, `report-14`); E, F, G the small high crown with half, a little and no taper; H today's crown,
  little taper (`report-15`, `report-16`); J today's crown and leaves on a trunk with no taper - his own ask of 19:35
  (`report-18`, `report-19`), its top a round dome; offered: J with A's ragged sprays closing the top instead.
  Judge: which reads as a really tall redwood and leaves enough of the floor in view.

**In the game, when the batch is live**
Water
- [ ] **The shore wave** - any beach (Sunset Beach, the pier at Westport). It came in as a ruled white line, fast; now
  slower, scalloped, in lengths. Judge: does it read as a wave; is one wave enough (the concept BE5 has several rows).
- [ ] **Sunset on the sea** - the pier, about 19:20. No long shadows across the water (the Ferris wheel's); the low sun
  glitters on it. Judge: the glitter - too much, too little, right. Picture: `report-1-pier-sunset`.
- [ ] **The day's sparkle** - his open question of 11-21: does the calmer sparkle read flat. Any sea or lake at noon.
- [ ] **The sea's bed near shore** - seagrass and coral no longer start on a ruled line.
- [ ] **Koi** - a botanical garden's pond: they swim; none stands on the water; no pale discs (they were jellyfish).
- [ ] **Granite Hot Springs after dark** - water with steam, a dim glow; it was a white shape. Picture:
  `report-3-springs-night`.
- [ ] **A lake at night** - a little brighter than before (no tree shadows from the moon on open water).
- [ ] **The salmon** - a river falls with a pool at its foot (dev: `near falls`): the leap (seen from the side, the
  tail), the splash, the climb starting at the foot of the falls. At the gorge they only leap and fall back: its
  falls lands short of its pond (to be fixed with the biomes). Picture: `report-5-salmon`.
Plants
- [ ] **Shrubs and sunflowers whole** - the botanical gardens' sunflower row; any hedge, hibiscus, bougainvillea,
  pampas grass. 41 kinds were cut flat by their canvas. Judge: none looks too tall where it stands (5 to 10 art
  pixels more crown). Picture: `report-6-plants-cut`.

The woods and the meadows
- [ ] **The found places** - 34 little scenes a short walk off the trails and roads (dev: `near wayside`, again for the
  next): in Highland Woods ruins, an oak with a bench, a fire ring, a mossy log with mushrooms; in Willow Valley a
  dry-stone wall with a gate or a stile, an oak with a rope swing, beehives by sunflowers, a windmill and trough.
  Judge: do they read as places someone made and left; are there too many or too few; the ruins' size. Picture:
  `report-7-found-places`.

- [ ] **The Sentinel Stones** (Granite Peaks, the headland north of the observatory) - darker, lichened, drawn half
  as tall again, on a round of turf. Judge: do they read; too tall. Picture: `report-12-stones`.
- [ ] **The fields' edges** - any farm (the Dry Creek co-op, Lake Road): a ragged grass verge and a strip of turned
  earth round every field instead of a ruled line. Judge: the widths (a verge of about 6 px, earth to about 17);
  whether fields now read as hand-made or want more (a track between fields, hay bales, a tractor: the farm's own
  pass, not started). Picture: `report-8-farm`.
- [ ] **"The flower row"** (his note of 11-23) - read as the sunflower and lavender rows that stood on sand and on
  North Cape's cobbles (now cut back from the shore) and the rows' ruled soil (now edged). If he meant a particular
  row somewhere: where.
- [ ] **The off-road trails** - the Red Rock Trail from the MX park's east gate; the Highland Enduro from its car park
  on Highland Road: two ruts (one for the enduro's single track) that fade in at the start, instead of a grey band.
  Judge: do they read as a trail; is the enduro's too faint under the redwoods to follow. Picture: `report-9-trails`.

- [ ] **Streets and alleys open up** - stand in any city street with a row of buildings to its south (the far
  sidewalk under their roofs), or in an alley: every building lying over the street, sidewalk or alley you are on
  goes see-through, 20 tiles either way. Judge: the reach; whether too much ghosts at once; intersections; and
  whether the alley behind the row you FACE should open too (it would ghost the shopfronts).
- [ ] **The footbridges** - the Stadium park's across its pond, West Hills' two over the creek (you could not walk
  over any of the three: now you can), the Giants Loop's (its trail reaches it), Highland Way's over the river (the
  giant that stood over it is gone). Judge: walk each; Highland Way's sits at a slant to its river - does it bother.
  Picture: `report-17-footbridges`.

**Not looked at by Claude at all** (so his look is the first): a phone; the islands' and harbours' water; a salmon's
last leap over the top of a falls; the other fish's leaps.

- **Nature redrawn without the painted shadow** (11-25, his word of 03:29): done on the branch - 114 of 129 plant
  kinds, rocks, logs, the forest floor and the ground palettes, at the source; the list and the census are in
  docs/tasks/NATURE-REDRAW-2026-11-25.md. For his eye: before / after of the spot he circled, Pine Lake, Coral Cay
  Falls. Live with the re-bake.
- **The giants' tops**: a mix of three, his pick of 03:20 - in.

- [x] **The mountains' look - B** (the owner, 11-25 07:19: "B for the mountain/cliffs is best ... let's not do any
  snow for now"; in, with the re-bake). It was: three variants of a Granite Peaks crag for his pick -
  A as it is, B one cliff wall with the rock behind rising in ledges, C the same with snow on the high benches
  (docs/tasks/MOUNTAIN-LOOK-2026-11-25.md, report-38.png).
- **See under the El and the highway decks** (his note): in, by the buildings' rule; with the re-bake.
- **A fork's double yellow lines** (his note): fixed for every fork; with the re-bake.
- **The fern kit**: planted (ten kinds by wetness, gold bracken under 5% and only in sunlit gaps); with the re-bake.
- **Emotes** (his note: faceplant, lying down, sleeping never lay flat): every emote stood on its first frame - fixed,
  page code, live on his word; seen flat in a local game (`report-42`).
- **The shark's bite**: redrawn (`report-41`).
- **Bridges over the water**: on piers, a deeper shadow in their lee; the sea's edge has no painted white. With the
  re-bake. Judge in the game: do bridges now read as bridges; is the shore right with only the moving waves.
- [ ] **Cloud shadows** (his yes of 11-25 15:10 on the still `report-43`): built - soft shadows drifting over the land
  by day, none at night. Picture: `report-58` (in a forest; open ground not photographed). Judge in the game on open
  ground: strength (0.36 of the sun at noon), size, speed; the debug menu switches them off on your screen.
- [ ] **Summit Tarn in a cirque** (11-25, his yes of 13:33): rock with cliff walls behind its north shore, a lower pool
  where its outflow ended. Picture: `report-52`. Judge: the wall's height and reach; Eagle Crag moved 5 tiles.
- [x] **The road over a creek** (the owner, 11-25 14:52: "looks good how it is now except the railings should be a
  little longer and connected to the street" - done, `report-52`).
- [ ] **The cats** (the owner, 11-25 15:26: the face as before with "a little nose", the tail "thinner and longer"):
  done so, the nose a light pink (15:42). Picture: `report-56`, `report-57`. Judge in the game.
- [ ] **The shark**: reshaped 11-25 (his ask of 15:10). Picture: `report-54`. Judge in the water, in the game.
