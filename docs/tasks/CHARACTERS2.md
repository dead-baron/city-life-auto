# Task: character polish, pass 2 - everything in the concepts, and every animation checked (for Fable)

Pass 1 is on this branch (`client/art2/peoplepolish.js`, behind the `cla.polish` switch, off by default; its notes,
critique and sheets in `docs/characters/`). **The owner chose proportions A** (11-19). He has added **95 character
concept images** in `docs/characters/concepts/` (C*, CB*, CC*, CP*, NP* and more) and wants the people taken as close
to them as the game's sprite size allows, with everything they show.

## Rules
- Read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/characters/NOTES.md` and `CRITIQUE.md` first.
- Work only on this branch (`characters`); small commits. **Never push to `main` and never merge into it.** This shell
  has no GitHub login: don't push; the owner pushes the branch.
- Windows checkout: skip `tools/stamp-version.mjs`; judge tests by the ones your change touches.
- Everything stays **behind the same switch** (off = pixel-identical to today's people; a test keeps that true). Keep the
  game's sprite style - never the old high-detail close-up renderer. The world's baked art must not change.
- Keep the renderer's code budget (`test/perf.test.js`; it's tight - pass 1 measured 411.06 / 411 KB): share code,
  table-drive what you can; if it truly can't fit, say how much over and why in `docs/characters/NOTES.md`.
- Fixed budget: catalogue first, then build in priority order, commit each step; stop at finished work, not half-done.

## Do
1. **The concept catalogue** (`docs/characters/CONCEPTS.md`): look at every image in `docs/characters/concepts/` and
   write, per image, one short entry - what it shows (characters, outfits, poses, faces, hair, props, animation frames,
   UI), and the details that matter at game scale (silhouettes, colours, outlines, how dark clothes stay readable,
   accessories). Then a gap list: everything the concepts show that the game's people lack, ranked by how much a
   player would notice, each marked *fits at sprite size* or *too small to show*.
2. **Build down the gap list**, behind the switch. Expected near the top (confirm against the concepts):
   - **Dark clothing readable:** dark outfits merge into one mass today - fold lines, a lighter rim or a 1-px outline
     against the ground, separated top / bottom / shoes, as the concepts do it.
   - **Uniforms that read at a glance:** police (badge, belt, hat), and the other jobs' looks in the concepts
     (paramedic, firefighter, workers...).
   - **Hair:** the concepts' hair shapes on the new head (pass 1 only fitted them).
   - **Faces and skin:** the concepts' expressions, eyes, facial hair, glasses and accessories that fit.
   - **Outfits and accessories** the concepts show (bags, hats, jewellery, tattoos...) - into the wardrobe where they're
     new pieces (follow how the wardrobe adds a piece: `shared/wardrobe.js`, `shared/rules.js` lists).
3. **Every animation checked with the pass on** (fix what's wrong): all 8 directions of standing, walking (add the walk
   bob if the concepts show one), running, idle, sitting (benches, cars' seats, bikes, horses, boats, kayaks), swimming,
   diving / rolling, carrying (crates, boards), punching, aiming, fishing, dancing, emotes, knocked down, in the
   creator's stage and the title portrait; name tags and speech bubbles over the taller head; held items (phone,
   weapons, rods) in the right hand at the right height. Render each to a sheet and look at it.
4. **Sheets** in `docs/characters/pass2/`: concept | pass 1 | pass 2 side by side for the main concepts, an animation
   sheet, a night / rain / busy-ground sheet, and a line-up of every uniform and NPC archetype.
5. **`docs/characters/NOTES.md`**: what pass 2 changed, what's left, what didn't fit at sprite size, and the owner's
   choices to make.
