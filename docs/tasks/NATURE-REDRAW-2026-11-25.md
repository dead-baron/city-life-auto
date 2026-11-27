# Nature redrawn without the painted shadow (2026-11-25)

The owner, 11-25 03:29: "the art that has the super dark shadow drawn into it all of those just need to be redrawn
from scratch ... Can you do a check on all the environmental art and make sure none of it is being drawn with this hard
shadow, if it is lets get a list and redraw all of them and just let me know what needed the redraw ... trying to get
rid of it seems to change the color of the asset and it doesnt blend in with the other nature in the area."

## 1. What was wrong
The plants are drawn by code from two things: a palette (a ramp of tones for each colour) and a painter (which tone
goes where). The shadow was in both, for every plant at once:
- **The palettes.** The leaf ramp's shade side swung 42% of the way to blue-green and fell to 28% of the leaf colour's
  lightness; the ramp for bark, stone and props swung to violet and fell to about 35%. The forest floor's soil was a
  hand-typed palette that started at #121012 - near-black. The grass, moss, needle and mud palettes started under the
  style anchor's darkest green too.
- **The painters.** Every leaf clump "falls into a dark pocket at the lower right", with a dark core behind the crown
  and the back clumps a step darker; outlines were 42% of the colour beside them, whatever that came to.
- **The first fix** (11-24/25) left all of that and lifted the finished picture's dark tones, pulling them to one
  anchor green. That is why colours shifted and the shape of the shadow still showed. It is gone.

## 2. What was done: redrawn from the source
- `client/art2/palette.js` `natRamp` / `NAT` / `lumFloor`: nature's ramps. The shade side stops 44% of the way to black,
  leans 40% less to violet, and no tone is under 50 of 255.
- `client/art2/flora.js` `FOL` / `LEAF_PAINT`: the leaf ramp's shade side stops half way to black, swings 40% less to
  blue-green, no tone under 46 (the anchor R1-D's darkest green). The clump painter: the pocket 0.3 -> 0.16, the core
  0.06 -> 0.24, the back clumps 0.18 -> 0.1. Outlines never under the floor. Every plant pixel is written through one
  function, which holds the floor (a poppy's dark heart is a deep tone, not black).
- `leafLight` now only turns normals to the sky (leaves three quarters, bark 15%), as the sword fern was drawn: the
  form is the game's light to give, by the hour. It changes no colour (tested).
- Redwoods (`redwoods.js`), ferns (`ferns.js`), rocks, outcrops, cliffs, sea stacks, rock stacks (`terrain.js`), the
  redwood, wild, tropic and desert prop kits, the water's banks, moss and rock (`water.js` RB): nature's ramps, floored
  outlines.
- The ground (`ground.js` `NP`): grass (lawn, park, green, meadow, dry, alpine), clover, moss, needles, mud, creek
  gravel, plough, red soil, scree, pebbles, corn and the ground-cover plants' own palettes are spread up from the
  floor, each tone keeping its hue; the forest's duff is a new deep warm brown (#3a2c27 up), not near-black.

## 3. The check: every pixel, lit as the game lights it at noon
`tools/nature/darkscan.mjs` builds the world, bakes the chunks of a place and counts the land's pixels that come out
under 50 and under 35 of 255 (the style anchor itself: 10.6% and 3.7%), with a picture marking them and `--who` naming
the art they belong to. `tools/nature/paintscan.mjs` does the same for each plant kind on its own.

| Place | live (under 50 / under 35) | redrawn |
|---|---|---|
| Fernwater Creek, the redwoods (the spot the owner circled) | 21.8% / 10.2% | 4.1% / 0.1% |
| the deep redwood grove | 18.2% / 9.2% | 6.8% / 0.0% |
| Coral Cay Falls (jungle) | 24.4% / 10.8% | 12.9% / 0.5% |
| Macaw Cove (jungle shore) | 23.3% / 10.8% | 12.9% / 0.9% |
| Granite Quarry | 11.1% / 3.5% | 10.7% / 3.3% |
| Cairn Peak (mountain) | 3.7% / 2.0% | 1.8% / 0.3% |
| Canyon Oasis (desert) | 11.9% / 5.3% | 7.6% / 1.9% |
| Dusty Hollow (desert town) | 9.9% / 3.0% | 9.5% / 3.0% |
| Red Rock Arch (mesa) | 6.3% / 2.6% | 3.4% / 0.8% |
| Egret Marsh | 22.2% / 9.6% | 4.7% / 0.4% |
| Bluffs Cove (coast) | 1.2% / 0.4% | 0.8% / 0.1% |
| Lakeside Greens (park) | 9.5% / 5.0% | 3.9% / 0.1% |
| Gull Woods Campground | 11.8% / 8.2% | 4.4% / 0.4% |
| Pine Lake | 22.7% / 11.8% | 1.7% / 0.1% |
| Summit Tarn Falls (mountain) | 3.2% / 1.3% | 0.9% / 0.1% |
| Sea Stack Cove (coast) | 1.3% / 0.5% | 0.8% / 0.1% |

What is left over 5%: the quarry's cut benches and tunnel mouth, a desert town's buildings, the volcanic cliff's rock
in the shade (dark grey, none of it near-black), trunks' flanks turned from the sun (dark wood).

## 4. The list: what needed the redraw
**Plants: 114 of 129 kinds** had over 5% of their pixels painted under the floor (all kinds together:
15.4% of pixels; now 0.0%). Near-black at noon, all
kinds: 23.5% -> 12.8%.
The worst (painted under the floor): ocotillo 39%, cones 37%, lupines 37%, mtnFir 34%, juniper 34%, aLupine 32%, pine 32%, pondPine 31%, mesquite 30%, redMaple 30%, litter 29%, poppies 28%, brittle 27%, mtnPine 27%, paintbrush 27%, creosote 26%, young 26%, hydrangea 26%, birch 26%, coastCypress 26%, fern 26%, clover 26%, strawberries 26%, foxglove 25%.

All 114: aDaisies, aLupine, agave, apple, aspen, banana, barrel, berry, berryShrub, birch, bird, bougain, boxIron, boxStone, bracken, brittle, bursage, buttercups, cedar, cherry, clover, coastCypress, cocoUp, coconut, columbine, cones, creosote, cypress, dFlowers, dPoppies, daisies, date, deadSnag, desertFan, elephant, fanSkirt, fern, fernR, fir, flHedge, flowerTree, foxglove, gate, giant, giantH, giantL, giantLH, giantS, giantSH, ginkgo, heather, hedge, hibiscus, huckle, hydrangea, icePlant, joshua, juniper, larch, lavender, leaning, litter, lupines, magnolia, maple, mapleAutumn, mesquite, monstera, mtnFir, mtnPine, oak, ocotillo, olive, orange, paintbrush, paloVerde, pear, pine, pondPine, poppies, redMaple, redwood, redwood2, redwood2H, redwoodB, redwoodC, rose, royal, rushes, sage, saguaroBig, saguaroMid, saguaroSmall, salal, sapling, smallPalm, spruce, stonesDark, stonesRed, strawberries, street, streetPl, sunflowers, topBall, topCone, trillium, tulips, tumble, twigs, twisted, whitePine, willow, young, yucca.

Not needing it (15): beachGrass, cattails, cholla, daffodils, dryGrass, dryTuft, duneGrass, pampas, reeds, sorrel, stones, tallGrass, toadstools, weed, wildflowers.

**Other art redrawn:** rocks and boulders (granite, sandstone, red rock, basalt, lava, cave), outcrops and cliff
faces, sea stacks, the red rock's stacked towers, crystals' rock; stumps, nurse logs and the fallen giants; the
redwoods' kit (basalt columns, column falls, floor pieces); the wild, tropic and desert prop kits (logs, stumps,
pilings, steps, ginger, driftwood and the like); the banks, moss and rock of the water; the ground palettes above.

**Not touched:** buildings, roads, vehicles, people, animals; the water itself; shadows that are shadows (a hawk's,
a cloud's); cave mouths and tunnel mouths.

## 5. To go live
Baked art: it goes out with the one re-bake (about five hours), on the owner's word. Until then the live game shows
the old art.
