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
  done so, the nose a light pink (15:42), centred under the eyes from the front (15:48), the grey cat's pink and
  the black cat's black (15:52 - faint on a black face), no pale row above a nose (16:00), one pixel again (16:18). Picture: `report-62`. Judge in the game.
- [ ] **The shark**: reshaped 11-25 (his ask of 15:10). Picture: `report-54`. Judge in the water, in the game.
- [ ] **The desert's plants** (11-25): flower beds were 39% of its small plants, now 4.4% - scrub, cacti, a rare
  patch of bloom with the yellow brittlebush first. Picture: `report-63` (before, after). Judge: is a rare patch
  right, or none at all.
- [ ] **The desert's water** (11-25): a seep's ring is pale cracked mud (was dark mud with blue puddles); the green
  strip along the desert's river grows rushes and grass (was lupines, foxgloves, berries); cracked earth is flat
  plates (was cobble-like - it is the tables' tops too). Picture: `report-64`. Left: a seep's pool is square-cornered.
- [x] **The tables' cliff faces: A** (the owner, 11-25 17:18: "For table edge I think A does look better"). A, as
  built: each piece a stack of stepped rings. B, one sheer wall with a flat cap, was shown (`report-65`) and is not
  built.
- [ ] **The desert, left to do** (11-25): the mission ruin made bigger (a step of its own: its model is shared with
  today's world and doubling it is heavy); a seep's square pool (with the water's edges).
- [ ] **The desert's found places** (11-25): 30 by rule, 6 each - a cracked playa with a dead snag, a stand of
  hoodoos, saguaros round a rock pile, joshua trees among boulders, a tin shack with a rusted pickup (`report-69`).
  Picture: `report-66`. The playa's pan is small (4-7 tiles across).
- [ ] **The hoodoos** (the owner, 11-25 18:14: "very unnatural ... vary the sizes ... not all so uniform and
  perfectly flat and round"): redrawn as weathered rock - stacked lumpy beds, leaning, thick and thin, a tilted
  slab or a balanced boulder on top or worn to a spire, mixed heights in a stand. Picture: `report-70`. Judge: do
  they read as natural rock now.
- [ ] **The arch by the lookout** (Red Rock Desert): it was the sea's arch - grey rock, turf on top; now red
  sandstone, bare. Picture: `report-68`.
- [x] **The bake's code budget 1,150 KB** (the owner, 11-25 16:51: "lets raise the bake limit").
- [ ] **The tideline** (11-25): wild sea beaches were bare sand; a wandering line of kelp heaps, seaweed and a shell
  now lies above the swash; shells on the open sand a third of what they were (your note of 11-23). Picture:
  `report-71`. Judge: enough, too much.
- [ ] **Tide-pool shelves** (North Cape, Redwood Cove, Coral Cay's): dark basalt with rockweed, the pools reading
  as water (they were pale cobbles with pale blobs). Picture: `report-71`.
- [ ] **Sea stacks** (your notes of 11-23 "in a line" and 11-25 on rock drawn by code): no three in a line any more
  (four off Redwood Cove stood on one column of tiles), each its own size and one of twelve shapes - towers with a
  shoulder, broad blocks, twins - with rocks at the foot. Picture: `report-72`.
- [ ] **The sea cave's rock**: a headland of crags with the cave in its tallest face (it was a round drum of
  stepped rings). Picture: `report-72`.
- [ ] **The bluffs** (11-25): North Cape's column of square turf-topped blocks is a scarp of basalt boulders and
  outcrops along the shore; the Egret coves' horns are rough headlands (they were one straight wall piece each).
  Picture: `report-73`.
- [ ] **Knees in the marsh** (11-25): huddles of cypress knees here and there along Egret Marsh's water's edge
  (drawn on 11-21, never planted till now). Judge: do they read at the game's size; the marsh has no swamp
  cypress tree of its own to stand over them.
- [ ] **A fall lands in water** (11-25): Fern Gorge's fall stood 52 px of grass short of its pond, Macaw Falls 28,
  two of the Redwood River's 32, a ledge fall at Macaw Cove 128 px of beach from the sea - the water now comes up to
  each one's foot (the beach one as a rill across the sand). Picture: `report-75`. Judge in the game: the gorge's
  salmon now climb from water.
- [ ] **Boulders and outcrops** (11-25, your rock rule): every outcrop was the same three-ring cake, every boulder
  one dome with a small one at its right. Now five builds each, eight pictures a size, masses off the middle, no
  chimney, the desert's stone without green turf. Picture: `report-76`. Judge in the game: a rock field in Granite
  Peaks and one in the desert.
- [ ] **Desert pools and riffles** (11-25): a seep's pool is round and lobed, not a square; a riffle's white is
  broken, not flat blobs. Picture: `report-76`.
- [ ] **Fallen logs in the woods** (11-25): the world had 13 wild ones. Now 215 among Highland Woods' and Granite
  Peaks' trees, mossy, with ferns and toadstools along them, none under a tree's crown. Judge in the game: walk
  the woods off a trail.
- [ ] **The redwoods' hollow trunks and root caves** (11-25, NS1-A): one old giant in 25 carries a fire hollow
  at its foot (241; since 11-26 a dark brown, not black - the plants' never-black rule; `report-77` shows the black); 28 root caves - a fallen giant's root mass with a dark way in. Picture: `report-77`. Neither
  is walk-in: they are things to find. Say if you want an inside.
- [ ] **YOUR CALL: the mission ruin bigger.** Not built: at a church's size its one voxel model needs about 425 MB
  while its chunk bakes (104 MB today, already the game's largest). Two ways: split the model in two, or change the
  voxel kit to keep less per voxel. Either is a half day; say if you want it.
- [ ] **The cinema** (11-25, before the beta): The Grand Theater's inside was two screens and fifty rows of empty
  carpet. Now a compact cinema at the door - lobby with the counter, benches and ropes, a hall, four screens showing
  four films. Picture: `report-78`. Judge in the game: walk in, buy a ticket, sit in a near screen and a far one.
  Left for your word: The Palace as a second cinema; the building's huge plain outside.
- [ ] **A flat over a shop has its own door** (11-26, part B's first row): 391 shop fronts had a flat's spot on the
  shop's window with no door drawn ("Midtown Apt #32's lobby door at THE TRESTLE TAP"). Each now has a short pier of
  the building's wall at one end of the front with a painted door in it; the shop's window, awning and sign keep to
  the shop (382 doors; 9 are apartment lobbies and stay). Picture: `report-86`. Judge in the game: Trestle Street in
  Midtown, the Arts District's galleries - stand at the flat's door: the prompt is the flat's, the shop's door its own.
- [ ] **Hotels' entrance canopies** (11-26; your word of 09:00: "it's okay some signs are on the canopies, don't want
  it to be all the canopies though"): every hotel, motel office and airport concourse had the filling stations' white
  slab standing over its own name. Now a cloth canopy in the front's colour: a hotel with a name of its own carries
  it on the canopy's front edge (16 places); an OFFICE, a plain HOTEL, an airport's DEPARTURES keep the board on the
  wall over a plain, lower canopy (35). Pictures: `report-87`, `report-88`. Judge in the game: The Bridgeview in
  Midtown, the Pink Mile's motels, the Grand Neon Hotel.
- [ ] **Picture signs** (11-26; your pick of 11:02 on `report-92`: "a combination of A and B ... not every shop in the
  world needs the sign"): 234 of 1,731 shops with a name board also carry a picture sign hung out over the front - a
  book, a cup, a burger, three gold balls, a record, a barber's pole ... 21 pictures. Picture: `report-93`. Judge in
  the game: how many (one in three of the fronts it suits today), the pictures that read badly, whether one-storey
  shops should get one too (they have no wall above the board).
- [ ] **Shop windows by trade** (11-26): nine new windows - pharmacy, gun shop, hardware, barber (with its pole),
  sports, tackle, bakery, clinic, jeweller - and every named shop shows its own trade's (256 fronts changed; a
  pharmacy showed a mart's shelves, a gun shop guitars, one clinic a row of bottles). 33 name boards change face
  where the name was read as the wrong trade (a nail bar as a hardware shop, DISCOUNT stores as night clubs).
  Pictures: `report-94`. Judge in the game: Pier Street Shops (gun shop, sports, hardware side by side), Net & Tackle
  on the harbor, Brilliant & Co., any small-town clinic.
- [ ] **No people painted in shop windows** (11-26; your word of 12:40): the clerk at every till and the busts in the
  booths are gone from every shop front; mannequins stay. Judge in the game: any street - a window shows goods and
  no one standing still in it. The stadium's stands still have painted spectators: say if those go too.
- [ ] **The pool table** (11-27; your notes of 11-17): the pool game's balls are numbered pixel balls (solids with a
  white spot, stripes with a band), the shot's words are a fading line under the table, and in the bar the balls and
  the cards sit on their tables - a head in front covers them. Picture: `report-95`. Judge in the game: play a frame
  at the Rusty Spur; watch a game on the table from the door; the card table. The balls on the bar's table are two
  art pixels each - say if they should be bigger than the table's scale allows.
- [ ] **The Boom Tester** (11-27; your note of 11-25): nothing held, an ember on each hand, a shot thrown as a punch
  with the hand flaring, the shot a ball of fire. Picture: `report-96`. Judge in the game: debug menu, Fire - the
  hands when standing, walking, aiming.
- [ ] **Shops under a tall tower's picture** (11-27; found in the running game): walking a street with a very tall
  building on its south side, the tower fades - and the shops it was drawn over showed as bare dark lots (the Bench &
  Bar and half of Capitol Florist, facing the Grand Neon Hotel in Civic Center; on live today). They now show their
  fronts. Picture: `report-98`. Judge in the game: Civic Center, the street north of the Grand Neon Hotel - by day
  and at night (at night those fronts show but do not glow: say if that matters). Inside the Bench & Bar the hotel
  no longer lies over the floor.
- [ ] **Signs after dark** (11-27): a white lit sign with dark letters was a white bar at night (HOME RUN SPORTS,
  Pier Street Shops), a yellow neon name a blob (Vinyl & More, Midtown). Both read now. Picture: `report-99`.
  Judge in the game at night: Pier Street Shops; Midtown's high street.
- [ ] **Lit windows at night - YOUR PICK** (11-27): A, as live - every lit window a flat pale pane; B, rooms - a
  calmer glow with the curtains, blinds, the plant or the cat on the sill dark against it, the lamp brightest; C,
  the same at half B's strength - soft panes, the lamps as points, a darker street. Picture: `report-97` (A, B, C
  from the top). Built and switched off (`buildings.js` `ROOM_LOOK`, `ROOM`); say A, B or C.
- [ ] **The phone box and the ATM booth** (11-27; the shared kit's audit): the phone box redrawn (aluminium and glass,
  a lit blue header with a handset); the 49 cash machines that stood alone on a sidewalk now stand in a glass booth
  with a lit ATM header; an awning leaves a gap over a cash machine in a shop's front. Judge in the game: Midtown's
  park street (a booth by the park), any phone box by day and at night.
- [ ] **Hammocks** (11-27; your note of 11-23, "too long"): the bed is a person's length; ropes go the rest of the
  way to the palms. Judge in the game: Coral Cay's beach bar, the tropic resort.
- [ ] **Hospitals and clinics outside** (11-28; your note of 11-22: "It looks like an apartment building from the
  outside"): ward windows in ribbons, pale clean panels, a glazed stair tower with the H or the cross at its head, a
  glazed lobby; a cool even light after dark; the red light over the doors less than half as strong; no awnings,
  washing lines or flower boxes on any. The Old Town Infirmary keeps its brick and its sashes, plain. Picture:
  `report-100`. Judge in the game: St. Neon General (Civic Center) by day and at night - does the name read now;
  Westport General; a town's clinic.
- [ ] **Signs on roofs** (11-26; your note of 11-22: "cut off through the roof"): 28 of 664 roof billboards and neon
  names had part of the board hidden - on a pitched roof, behind a smokestack or a tank, behind a taller building.
  A roof sign whose foot would be hidden is taken off (45; 619 stand). Judge in the game: Old Town's tiled roofs, the
  Neon Strip's roofs - no board standing out of a roof.
- [ ] **Painted lips over the run** (11-25, a look only): the mouth jumped a pixel about the face from frame to
  frame; it now sits under the middle of the eyes in every frame. Only figures with lipstick changed (55 of 2,688
  frames checked). Picture: `report-79`. Goes with the re-bake (the people's art is in the art hash).
- [ ] **YOUR CALL: the eyes' spacing over a walk.** Facing the camera the two eyes stand three pixels apart in some
  frames and four in others (each is rounded on its own). Fixing it changes every figure a little. Say if you want
  a before/after sheet first.
- [ ] **Clothing pictures in the Inventory** (11-26, part C3): a tile shows the piece itself, in its worn colours,
  drawn by the game's own people art - 334 of 390 pieces (thin jewellery and small hand things keep the glyph). Pictures:
  `report-80` (the Inventory before and after), `report-81-all-pieces` (every piece). Judge on your phone: do the
  pictures read, and how fast do they come in when the Inventory opens. (The shops already show each piece on your
  own figure.)
- [ ] **The UI in look C** (11-26, built on your pick): every menu and panel has hard notched frames, hard shadows,
  flat fills, square switches and pixel icons; the buttons over the street stay round. Pictures: `report-89` (pause, settings, phone), `report-90` (the Inventory before and after), `report-91`
  (a phone upright). Judge on your phone: every menu; the icons that read badly at this size (say which - they can
  be redrawn by hand). The buttons over the street have the pixel icons too (your word of 11:00); look C goes
  live with the art batch.
- [x] **YOUR PICK: the UI's look - C** (the owner, 11-26 09:00: "I think C looks good for the UI"; built 11-26 - the line above). It was (11-26, part C2): The same screens three ways - A today, B hard pixel frames
  with the line icons kept, C hard pixel frames with pixel icons: `report-82-ui-pick-inventory`,
  `report-83-ui-pick-settings`, `report-84-ui-pick-close`. Nothing in the game is changed yet. Say A, B or C (or
  what to mix), and every screen follows with a lint.
- [x] **YOUR PICK: a soft lip colour - A, none** (the owner, 11-26 09:00: "A was probably fine"; C if some get mouths later). It was (11-26; your note of 11-25 01:34): The starting looks' heads four ways - A
  none (today), B faint one pixel, C faint two pixels, D soft two pixels: `report-85-soft-lips-pick`. Say which, and
  whether it is everyone's or a choice in the look screen. Nothing is changed yet.
- [ ] **YOUR CALL: a pool and stream above Coral Cay Falls** (the plan's jungle item). Not built: the spine above the
  falls is tall rock drawn up the screen, so water on the ground there is hidden, and the concept shows no stream
  above the fall either. If you want it, it is a new piece - a pool drawn into the top of a rock.
