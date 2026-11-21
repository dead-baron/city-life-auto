# Pre-beta handover: the combined art branch (`prebeta-art`), 2026-11-21

Written for the session that does the pre-beta fixes (the owner plans Opus 5.5 after the Fable work pauses). Read
`CLAUDE.md` and `docs/DECISIONS.md` first, as always; then this. Nothing here is live: `main` is unchanged.

## What this branch is
`main` (b1355aa0) with every finished waiting branch merged in, clashes settled, stamped:

| Branch | What it brings | Art re-bake? |
|---|---|---|
| `audit-security` (holds `audit`, `audit2`) | The three audit reports (`docs/audit/`), the world lint rows at their counts (`tools/placementlint.mjs`, `tools/audit/`). No fixes. | no |
| `characters` | People: bodies, faces, wardrobe, the creator (passes 1-5 and the overnight work) | yes |
| `quickwins` | UI fixes from audit 2: pixel font in menus, bag button, debug button hidden, touch layout, device words, the gate | no |
| `fsrow` | Fullscreen switch in Settings > Graphics | no |
| `animals` | Animal and critter art at the game's pixel | no |
| `itemicons` | Item and weapon pictures in the bag and the quick wheel | no |
| `nature` (merged again as it moves; see `git log`) | Plants and rocks at the game's pixel, variety laid out and tested, undergrowth rules, nothing through fences | yes |

Not merged, on purpose: `egret` (a world change, and it clashes with the audit's lint counts in
`tools/placementlint.mjs`: merge it as the first step of the world batch, keeping egret's lower counts for its three
rows); `neon2`, `inventory`, `ads`, `founderpack`, `director` (the owner's ship-or-drop list, pre-beta list section E).

The world hash is main's (`99ac647e7de8`): nothing here changes the world. The art hash is new: going live re-bakes
the art once (about five hours on the server).

## How the clashes were settled (so nobody redoes it)
- `docs/DEVLOG.md`: both sides kept at every clash (842 entries = main's 800 + each branch's own; checked by count).
- `version.json`: re-stamped after the last merge.
- `tools/perf.mjs`: `characters`' budgets kept (bake 1080 KB, renderer 510 KB / 29 files - the owner's words of 11-20).
  `animals` (1024 / 419) and `nature` (1022) had raised the old numbers for themselves; both fit inside characters'.
  Measured combined: page 533 / 540, city 378 / 380, bake 1062 / 1080, renderer 486 / 510.
- `docs/DECISIONS.md`: both sides kept, one line added saying the above.
- Every game file merged without a clash.

## Tests
The whole suite (418 files) is run one file at a time on this branch; the result of that run is in the commit that
follows this file, as `docs/tasks/PREBETA-TESTS.txt`. If that file is missing, the run was not finished: run it
(below) before relying on this branch. Known to fail on `main` too: `test/uiscreens.test.js` test 5,
`test/world3arrivals.test.js` test 4. The audit of 11-19 listed 13 failures on Windows to recheck on Linux.

    for t in test/*.test.js; do NODE_OPTIONS=--max-old-space-size=3072 flock /tmp/cla-heavy.lock node --test $t; done

(One at a time: the dev box has 4 cores and 7 GB; `npm test` runs them side by side and runs out of memory there.)

## What still needs the owner's eyes before any of it goes live
- Characters in the running game on desktop and phone (pre-beta list, "the plan for Friday", step 2).
- Animals and item pictures: his two rounds of notes are applied; he has not seen them in play.
- Nature: he has seen sheets and area pictures, not the running game. Open: the plants' painted light (as now, or
  side light left to the game) - DECISIONS, Art direction.
- Go-live is his word, per branch or all at once.

## Going live, when he says so
1. Page-only first if he wants an early look with no re-bake: `quickwins`, `fsrow`, `animals`, `itemicons` could go
   from their own branches. Simpler: this whole branch at once, with one re-bake.
2. Best: do the world batch (below) on top of this branch first, so the world and the art re-bake once together.
3. `node tools/stamp-version.mjs`, the suite, then merge to `main` and push at a quiet time. The server rolls back
   a version that fails its health check.

## What comes next on top of this branch
1. **The world batch** from `docs/audit/REPORT.md` and the pre-beta list section A: each row a class fix, the lint
   count brought down in `LINT_ALLOW`, never up. Start with `egret`. Also to place in the same batch: the nature
   pass's solid pieces (Summit Tarn's rock band, the redwood horseshoe falls, stone ruins, dry-stone wall and gate,
   oak with a swing, stile) - the owner, 11-21 13:08 - and a small pool with a little stream on the cliff top above each
   of Coral Cay's falls (the owner, 14:54; `shared/world3-tropic.js`; the fall takes it as its source by itself). To check: a cactus and a red rock in a paddock's gate gap in his
   picture of 11-21 (a new row: a prop on a fence line or in a gate).
2. **The pre-beta list** sections C to H, the audit 2 top 20 that `quickwins` did not cover, the security audit's
   remaining "high" items, and the owner's new notes.
3. **More nature art** keeps arriving on `nature` (falls, biomes, water): `git merge origin/nature` here; expect
   clashes only in DEVLOG.md and version.json, settled as above.

## Two checks worth building first (they pay for themselves in the owner's usage)
The owner, 11-21 14:03: "I spend a lot of usage catching issues that broke when another fixed, or fixes that weren't
applied across the world."
- **Every note has a check or is marked eyes-only.** Add a column to the decisions register / pre-beta list: the test
  or lint row that guards each note. A note with nothing guarding it is the one that comes back.
- **A fixed set of places re-rendered before and after any world or art change.** `tools/area-shot.mjs` already takes
  many `--rect`s in one world build (16 falls in one run on 11-21). Keep a list of about 40 places (one per district
  and biome, every kind of water, every hand-made place), render it before and after, diff per place, and list the
  places that changed. Unexpected changes are the "fixed here, broke there" cases.

## Working rules that bit us (all in DECISIONS, repeated because they cost time)
- Never push to `main` without the owner's go-ahead; feature branches only.
- Heavy commands one at a time under `flock /tmp/cla-heavy.lock`, Node heap 3072 MB.
- The disk is nearly full: use sparse worktrees without `docs/art-v2/` (this one is 62 MB); delete captures once seen.
- Stamp before every commit; a DEVLOG entry per feature; an owner decision into DECISIONS in the same commit.
- Show the owner 2-3 variants before wiring in a visual direction; reports short, 2-3 small pictures.
