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
- `waterwatch.sh OUTDIR` (with `waterprobe.js`): the water recorder. Starts a local game headless, jumps to each kind
  of water place (`PLACES="pier marsh tarn falls"`: kinds the dev command `near` knows) and films it at several hours
  and weathers (`MODES="780:clear 1160:clear 1320:clear 780:rain 1320:rain"`, minute of the day : weather - the first
  must be a clear midday, which tells the water's pixels). For each it prints how much of the water jumps in
  brightness per tenth of a second (`jumpMedian`, %) - sparkle and crawl that read as glitches score high; calm water
  is under about 1; the evening's glitter on the sea reads 1 to 3.5, as meant - and saves two pictures: the place, and
  the jumping pixels in red. About three minutes a place at five looks. Things to know: the local server keeps its
  baked chunks by art hash (`.playtest-data/8171/art/`), so **stamp** (`node tools/stamp-version.mjs`) after a change to
  the bake or the pictures show the old one; `near` goes to the nearest place from where the character last stood, so
  delete `.playtest-data/8171/profiles.json` for the same places as a run before. `waterscore.py DIR` scores plain
  screenshots instead (too far apart in time to show flicker; kept for white-out and stills).
- Pictures of places: `tools/area-shot.mjs` takes many `--rect`s in one world build, e.g. sixteen falls in one run.

A plant's shape seed in the world is `1000 + v * 37 + species.length * 7` for shape `v`.

## A picture of the running game at any spot (11-25)
`tools/playtest.py` with `--start-server` (today's world; for World v3 start `CLA_WORLD=v3 node server/index.js` first
and wait about four minutes for "listening"), then the steps: wait for "Play as", `key:Escape` twice, `dev:tp:{x,y}`,
wait for the chunks, and before `shot:` an `eval:` that hides the first-time dialog - find the smallest visible
element whose text has "WHAT BRINGS YOU" (or "Where to"), walk up to its panel (under 700 px wide) and set
`style.display = 'none'`. `__S.art2` is the art host (its `fades`, `chunkState`, `map`).
