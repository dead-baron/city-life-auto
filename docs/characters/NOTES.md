# The character polish pass - notes (2026-11-19)

Staged and **off**: nothing a player sees has changed. The owner approves sheet by sheet (DECISIONS, 11-14).
Start with `CRITIQUE.md` (what was wrong), then the sheets.

## The sheets (all from `node tools/charsheet.mjs <name>`; no browser needed)

| File | What it shows |
| --- | --- |
| `before.png`, `after.png` | The eight (men and women of every build, from the starting looks): S, SE, E, N, standing and two walk frames at game scale, then standing and walking at 4x |
| `side-<who>.png` | Before over after, one per archetype |
| `faces.png` | Every eye, brow, nose and lip option on six skins, a man facing S and a woman facing SE, plus a profile - before over after |
| `grounds.png` | The eight at game scale on pavement, asphalt, grass, sand, at night and in rain (flat ground colours and a tint - not the game's lighting) |
| `builds.png` | Both bases, the five builds, the same tank top and shorts, S and E |
| `hair.png` | Every hairstyle, from the front quarter and from behind |
| `poses.png` | Walk, run, sprint, punch, aim, carry, hands up, kneel, sit, drive, ride, pedal, swim, down, fish |
| `variants.png` | **The proportions to choose from** (see "The owner's choices") |

## What changed (only with the switch on)

The rig, wardrobe, hair, shading, outlines and poses are the game's own (`client/art2/people.js`); the pass is a small
set of measures and a face, in `client/art2/peoplepolish.js`.

- **Proportions.** The head 4% smaller, the legs 20% longer, the arms a little longer and 15% thinner. A figure is 1-2
  art pixels taller (25-26 instead of 23-24). Measured down the middle of a bald figure in a tee, the head and neck were
  10 of 24 rows (2.4); now 9-10 of 25-26, of which the head is 8 - **about 3.1 heads, from about 2.4**.
- **A neck.** The head sits a neck above the shoulders (the chin was inside them), the neck thick enough to be a pixel.
- **A shoulder line.** Squarer and a touch wider on a man; on a woman narrower shoulders, a waist and hips. Muscle is
  shoulders over a narrow waist; "curvy" is hips, "big" is the belly.
- **Hands.** Never smaller than an art pixel and a half, whatever the build's limbs.
- **A face.** The eye keeps its iris colour (task #429) but is darkened until it stands well under the skin it is on -
  today it is the skin's own shadow on tan and dark skin; on dark skin the cheek under it catches the light.
  Everyone has a brow (today "natural" draws none), in the hair's colour and never as dark as the eye. The eyes sit a
  little lower so the brow has skin to sit on under a fringe. A nose shadow on the side away from the light, and a
  two-pixel mouth - a man's in the skin's shadow, a woman's in her lips' colour. All six eyes, brows, noses and lips
  still differ (the look tests run again with the pass on).

## How to switch it on

- **In the game:** debug menu > *Character polish* > *Character polish pass on / off* (it reloads the page). It is
  this browser only (`localStorage` `cla.polish` = `1`); the title's portrait, the creator and everyone in the city
  are drawn with it. Off again the same way.
- **How it's built:** `people.js` `setPolish(POLISH)`; `game/peds.js` `loadPolish(url)` / `usePolish(on)`. A polished
  sprite's key starts with `~`, so the sprite workers draw what the page asked for and both kinds stay apart in every
  cache. `peoplepolish.js` is loaded only when switched on: it is in nobody's start-up code and no budget.
- The world's baked art is untouched: the chunk baker never reads the people (`test/peoplepolish.test.js` checks), so
  no art hash moves and nothing is rebaked.
- Tests: `test/peoplepolish.test.js` (off is today's people pixel for pixel; the switch; proportions; eyes on all 16
  skins; every pose), `test/peoplepolish-wardrobe.test.js` (the look and outfit tests again, pass on).

## Not done, and what I could not check

- **Not seen running in a browser.** The switch is unit-tested, and the sheets are the game's own bake of the game's
  own sprites, but I did not start the game here. Before approving, play with it on and look at: name tags and speech
  bubbles over the taller head, hats and umbrellas, people in cars and on bikes, and the creator's stage.
- **The founder's skeleton** is drawn through the same measures; not looked at.
- **Budgets:** with the pass off the renderer's code grew 0.5 KB (the hooks) - 411.06 KB against a budget of 411,
  measured here with LF line endings; `tools/perf.mjs` itself can't run on this Windows checkout. Check it on merge.
  Making the pass the default later means about 3 KB more renderer code: a budget decision then.
- **Not in this pass** (the owner's order is faces, then hands and arms, then clothing): dark outfits still close up
  (a black suit's arms and chest are one mass), a cop is still a navy figure with a cap, hair is unchanged beyond
  fitting the new head, and the walk has no bob.
- Stamping was skipped (the task's rule for this checkout): stamp on merge.

## The owner's choices

1. **Proportions: A, B or C** (`variants.png`). The brief asked for 3.5-4 heads; the 10-09 decision (in `people.js`)
   went to about 3 heads because a smaller head "shrank the face and the hair to a few pixels"; the concepts (C1, CB1)
   are about 3 heads. At this sprite size a face needs a head 8 art pixels wide, so 3.5 heads means either a smaller
   face or people about 15% taller against doors and cars.
   - **A (built):** about 3.1 heads, the head nearly today's size. My recommendation.
   - **B:** a smaller head on longer legs, about 3.5 heads; 2 more art pixels taller; the face loses a row.
   - **C:** today's head on longer legs.
   B and C are one line each (`POLISH.K`) if you prefer one.
2. **Approve the faces sheet?** If yes, the faces alone could go live first - they need no change of height.
3. **The next pass:** hands and arms, or dark clothing first? In the sheets the dark outfits are now the weakest thing.
