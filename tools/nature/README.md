# Tools from the nature pass (2026-11-21)

Small scripts used to look at the nature art without starting the game. None is loaded by the game or the tests.
Run from the repo's root; the heavy ones (a world build, about 3 minutes and 3 GB) under `flock /tmp/cla-heavy.lock`
with `NODE_OPTIONS=--max-old-space-size=3072`.

- `sprites.mjs out.json <preset> "<sp:seed:k[:c],...>"` or `"@recipes.json"`: makes world sprites through
  `statics.js makeStatic` (plants by species, or any recipe: `[{"name":"x","r":{"t":"fall",...}}]`), lit as the game
  lights them (`lightgame.js PRESETS_GAME`: noon, golden, ...), as the bake would lay them. `ROOT=/path/to/other/checkout`
  draws from another tree (live against a branch). `FALL=0|1|2` picks a waterfall look.
- `strips.py out.png <scale> "label:file.json" ...`: lays the outputs of `sprites.mjs` out in labelled rows.
  `BG=r,g,b` sets the background.
- `variety.mjs`: one world build; in several places counts how often a plant's near neighbours are the very same
  picture (the numbers in the DEVLOG entry of 11-21). The test that guards it: `test/undergrowth.test.js`.
- `falls.mjs`: one world build; lists every waterfall with its tile, width and drop.
- Pictures of places: `tools/area-shot.mjs` takes many `--rect`s in one world build, e.g. sixteen falls in one run.

A plant's shape seed in the world is `1000 + v * 37 + species.length * 7` for shape `v`.
