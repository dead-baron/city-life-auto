# Task: the character polish pass (people's bodies and faces) - for Fable

City Life Auto is 16-bit SNES pixel art with modern light (Octopath Traveler, Eastward), top-down 3/4 view. The
people (`client/art2/people.js`, `client/art2/peoplepresets.js`, the creator `client/creator.js`) read as blobs:
no neck or shoulders, heads too big, faces two dots and a bar, archetypes alike from the side (the 11-03 art audit,
gap 10, concepts C1, C2, C3, NP1, CB1-3 - look for the concept images under `docs/art-v2/` or `assets/`; if they're
not in the repo, work from the description here).

## Rules (all tasks)
- Read `CLAUDE.md` and `docs/DECISIONS.md` first and follow them.
- Work only on this branch; commit as you go (small commits). **Never push to `main` and never merge into it** (pushing
  main deploys the live game). This shell has no GitHub login: do not try to push; the owner pushes the branch.
- This is a Windows checkout: `tools/stamp-version.mjs` and some tests fail here for Windows-only reasons (paths,
  line endings) - skip stamping (Claude stamps on merge) and judge tests by the ones your change touches.
- Heavy commands (building World v3, the full test suite) one at a time, `node --max-old-space-size=3072`. A local
  server only on 127.0.0.1, never a public port. Be economical: this runs on a fixed budget.
- Finish with a short summary: what you did, what you left, and anything the owner must decide.
- **The owner's rules for this:** keep the game's sprite art style - never swap in the old high-detail close-up
  renderer; the polish is **staged and switchable** (a setting or flag, off by default until the owner approves),
  approved sheet by sheet. People are drawn in the page: watch the renderer's budgets in `test/perf.test.js`; the
  world's baked art must not change (no art redraw).

## Do
1. Study how people are built (the parts, the poses, the 8 directions, the outfits and hair from the wardrobe, the
   pixel grid) and render a "before" line-up sheet: 8 archetypes (men and women, each build), 4 directions, standing
   and walking, at game scale and 4x - with the existing tools (`tools/art2/`) or a small script under `tools/`.
2. The pass, behind the switch: proportions of about 3.5-4 heads; a neck and a shoulder line; hands; faces on the art
   grid - 2x2 eyes with brows, a nose shadow, a mouth, readable from the front and 3/4; hair silhouettes that read;
   builds that differ (slim, average, athletic, curvy, big); every outfit and hair piece still fitting (run the
   wardrobe/outfit tests: `test/peoplelook.test.js`, `test/outfits.test.js`, the creator's).
3. Render the same "after" sheet, and a side-by-side (before | after) per archetype, into `docs/characters/`.
4. Write `docs/characters/NOTES.md`: what changed, how to switch it on, what's left, and the owner's choices to make.

Spend most of the budget on getting the faces and proportions right; stop at a good, finished subset rather than a
half-done whole.
