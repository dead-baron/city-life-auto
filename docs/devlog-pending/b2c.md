## 2026-10-23 · b2c: see-through buildings, the stadium's stands, sharp arcade screens, the harvest you can see

**Buildings that hide you go semi-transparent, clear round you** (the owner: "The way buildings go transparent doesn't
currently look like it's the best solution ... maybe they should only go semi-transparent? Or semi-transparent but the
area around your character is fully transparent?"; a mast's hut "half of it disappears when walking near it"; "watching
half a building disappear this abruptly isn't the best look"). Before, every building whose picture came within 100 px
of you (150 in a car) faded almost all the way (0.88) everywhere outside its footprint - half the building gone in a
clean-edged block, even when it didn't cover you. Now (client/art2/game/host.js _fades, engine.js STATIC_FS):
- a building fades only while its picture covers your figure (and a little round it: 30 px either side on foot, 64 in a
  car; a train still only what stands over it), eased in and out in about 0.2 s;
- it goes to a ghost of itself (GHOST 0.45: its shape kept, the street behind showing through), and only round you - an
  upright soft-edged ellipse, 40 px (66 in a car), the outer 45 % of it soft - is it fully clear, so whoever is behind it
  draws over it there; round the players near you too (up to three more clear spaces, engine.js uClr);
- a tall thin one (its picture under 72 px wide, or more than 2.2 times taller than wide: a mast's hut, a lighthouse, a
  silo) ghosts less (GHOST_THIN 0.2) - it never vanishes by half;
- its footprint still never fades (no interiors shown until you walk in); the giant redwoods use the same ghost.
Cheap on phones: four more uniforms and a few ALU ops, only on the texels of a fading building. Tests:
test/seethrough.test.js (engine.js seeThrough is the shader's rule in JS), test/redwood-fade.test.js.

**The stadium's stands: rows of seats, a few people in them, a roof over the back** (the owner: "Stadium seating looks
weird. Hard to tell what it is ... we should just have rows of seats with occasional NPCs sitting in them ... The outside
wall (facing us) is super thin too ... Or just put a stadium roof/cover over the seating areas but make it so you can
still see all of the field just fine"). The stands' decks (client/art2/buildings.js roofMat 'seats') were a 2 px noise of
crowd colours over 7 px rows. Now, from the pitch back: the front wall with its advertising boards; rows of seats 10 px
apart, each its concrete step, the seat pans and backs in the club's red with navy bands (the front rows, the two over the tunnels), a gap between seats; aisles
of steps with yellow nosings every 128 px; the tunnels' mouths half way up; a few people sat about (about one seat in ten: a
quiet day's handful, their heads over their shirts, the right way round for a stand seen from behind);
and over the back 30 % the cantilever roof - corrugated sheeting on white ribs, its fascia shading the rows under its
edge - the stand's thick back, never out over the pitch. The rows step up 36 px from the front (deck heights: the sun
throws each row's shadow on the next). The north stand's face toward the pitch (statics.js standsOn) has the same red
seats, its front rows navy, a few people in them. Not done: more people when a match is on - the stadium's matches are players' pickup
games (server minigames.js), nothing tells the page a big game is on; a live crowd would need that message and an
overlay.

**The arcade's screens are sharp** (the owner: "Arcade games are really blurry right now (especially the text), is this
by design?"). The cabinets' games drew on a 256 x 224 canvas (the pool table's 256 x 160) that CSS stretched over most of
the window - circles, lines and the 5-8 px text smeared. client/arcscreen.js fitScreen gives the canvas as many pixels as
it covers on the device (CSS size x devicePixelRatio) and scales the drawing to it each frame, so the games keep their
256-wide coordinates and come out sharp; STARFALL's pixel art at a whole number of device pixels per pixel with
smoothing off. Skee-ball, pinball, air hockey, pool, the race book and STARFALL. Loaded with the games, not the page.
Test: test/arcade.test.js.

**The harvest you can see** (the owner: "Hard to tell what is being harvested with the harvester, can we make a better
visual for harvesting crops?"):
- The stubble reads as cut: dry soil between lines of short pale stalk ends with their shadows, a windrow of loose straw
  down the middle - plainly different from the gold of the standing crop (it was a pale gold a shade off the ripe one).
- The rows' state shows over the crop the ground was baked with: their decals cover up to 18 px over the ground
  (engine.js drawDecal zt, the decal shader's depth) - before, a cut stretch lay under the baked wheat's 8-12 px stalks
  and barely showed. A ripe row's uncut stretches still show the baked crop.
- A swath cut as you go: the server marks a tenth of a row cut the moment the header reaches it, so a whole stretch
  turned to stubble ahead of the machine. Now a machine working a ripe row stamps fresh stubble under its header every
  7 px (two rows wide for a combine), and the stretch it's in shows its stubble only once it has left it
  (render/farmart.js _working, a pooled ring of 1600 stamps).
- Chaff blows out of the combine's back and bits of straw fly (render/fx.js particles; art v2's own sets pChaff, pStraw:
  client/art2/fx.js, actors.js; a particle's new `lift` draws the chaff up over the crop - host.js _particles).
- The combine itself (client/art2/vehicles.js): the wide header with its crop dividers, cutter bar and cross auger, the
  reel of five yellow bats that turns while it moves (three looks, actors.js st.reel - host.js asks for the next ones
  ahead), the open grain tank heaped with the crop, the unloading auger along its side, the cab's white roof.
- What and how much: the field's crop is shared/fieldcrop.js (the rule the ground bake uses, groundbake.js fieldKindAt,
  held to it by a test) and the combine's tank fills a stretch at a time (server/systems/farming.js v.tank): "Harvesting
  wheat: the header cuts two rows at once and the grain fills the tank as you go", each row "Row of wheat harvested ...
  the tank: 60 bu of wheat", and the farm-work line on the HUD adds "- 120 bu of wheat cut".
Tests: test/harvestart.test.js, test/farming.test.js.
