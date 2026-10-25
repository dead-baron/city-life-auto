## 2026-10-25 - Batch 6a: the Neon Strip overhauled - the owner's neon signs, lantern alleys, the flagship arcade

The owner's notes, part 2: "The Neon Strip region isn't looking as good as it could be yet ... lantern (or hanging
lights) don't connect to anything ... custom buildings and lantern alleyways ... at night it really comes alive, but
still looks great during the day"; the panther and the tiger "could look a lot cooler"; "way more neon signs with cool
designs all around the neon district"; "a really awesome arcade in the neon district (... the points from all the
arcades in the game transfer ... so they're all tied together)".

**His signs, as pixel neon (client/art2/neonpics.js, new).** His two sign sheets (notes part 2, im-023 and im-024)
are now the district's picture signs: 27 of them, each cropped from his sheet, shrunk to game size and set on one small
palette (nine neon hues at four strengths: the tube's white-hot core, the tube, its fill, the deep edge) over the
sign's dark backing. The **panther** is cut out of the dark, like his. The **tiger** striding over the crown and
STREETWEAR replaces the old orange tiger (Afterglow's sign). The rest: the ramen bowl, SORA SUSHI, LUCKY PAW, the
PIXEL ARCADE game pad, JET BURGER, the palm CLUB, the Rooftop BAR cocktail, 24H CITY MART, the tattoo rose, GAME ZONE,
the vertical BAR, HOTEL, OPEN and cocktail blades, DUMPLING, SORA NOODLES, the dragon, the katakana words (karaoke,
club, nightlife), NIGHTCLUB, the oni, the maneki-neko and the two red paper lanterns. The old roaring head
(`tigerHead`) is the panther now.
- The glow keeps batch 2's tone. Each pixel glows by its strength: tubes 170-200, fill 60, deep and backing not at
  all. Inside a broad lit shape only its edge is a tube, and a sign whose whole panel was lit in the sheet has its fill
  as paint. So the strokes read and no sign glows as one block.
- The name sign on a Strip front keeps the shop's own name, smaller when it won't fit at the big size (it used to fall
  back to DINER or EAT).

**The fronts (shared/world3-neon.js, client/art2/neonsigns.js handNeon).**
- Every lit front gets a picture sign over its shopfront from a deck: its own by name (a ramen bar the bowl, the karaoke
  bar the katakana, the tattoo parlour the rose and the oni) or by trade. A tall front stacks one or two more of the
  district's up its face where there's room.
- The deck deals the least-used sign first and never the one the front next door has. On the built map that's 313
  fronts and about 30 designs, the commonest under a tenth of them.
- Low fronts (up to three floors) and the backs on the boulevard have a **picture sign standing on the roof's edge**
  (the kit's new `npic|key`, a y < 0 counted from the roof's south edge).
- The dressing round the signs (neonpics.js dressFace) gives each front light strips up its corners, holo panels with
  scanlines and a glyph, AC units dripping down the wall, a conduit with cables slung across, and a tube on the blink
  now and then.
- The backs on the alleys get a tagged **roll shutter** over the ground floor, with a lantern or small sign beside it.

**Strings of lights made fast at both ends.** Every string in the district now says what each end is fixed to: a post
of its own (drawn with it, from the ground up past the string, with a cap), a bracket on a building's wall, a palm or a
lamp (`ends`, and test/neonstrip.test.js checks each against the map).
- Blossom Plaza's strings used to stop in the air short of the fountain (his screenshot). They now run post to post
  round the fountain's ring and out from each post to the corner lamps.
- Lantern Lane's strings stand on posts behind the stalls and carry red paper lanterns.
- The festoon art (game/statics.js) draws the posts, the brackets, the lanterns (round red bodies with ribs, a gold cap
  and a tassel, lit inside) and a bare-cable kind.

**Lantern alleys.** Two new walkways, five tiles wide, run through the blocks from street to street, with red lanterns
zig-zagging wall to wall every two tiles:
- **Lantern Alley**, from the boulevard (facing Blossom Plaza across it) through to Lantern Street;
- **Red Lantern Row**, from Lantern Street to Crosstown Avenue.

Each has a gate at both mouths with its name lit, paper-lantern posts, vending machines (now in five colours), steam
off the grates and crates. Lanterns also zig-zag across both service alleys (Glow Alley, Neon Back Alley) from the
backs' walls to the rows', and across the passages between fronts.

**At night.** On the Neon Strip after dark the streets keep a sheen of wet (art2/game/host.js `_slick`, eased in and out
as you come and go). The engine's puddle mirror and light streaks then lay the signs' colour on the ground, with no
rain. Some signs' light flickers ('neonf' lights). By day the signs stay his painted colours on the dark walls.

**The flagship arcade.** The Pixel Arcade on the boulevard is now 24 tiles wide (from 16), with the game pad sign, GAME
ZONE on its roof and its POI flagged `flagship`.
- Its floor is `arcadeflag` (shared/homelayout.js): eighteen cabinets (a row along the back wall and an island down the
  middle, the four games round again) and the long 2x4 prize counter by the east wall. Every other arcade's floor has
  four cabinets.
- **The tickets are one balance** (`profile.tickets`). Checked: they already were, but nothing said so. Every arcade
  now says it at the door, on the floor, at the counter and in the score's message ("good at every arcade's prize
  counter").

**Budgets (tools/perf.mjs).**
- Bake: 875 -> 895 KB, 75 -> 76 files. The new module is about 19 KB of it, 14 KB of that the pictures. To make room, the
  old tigers' rows went, seven signs were cut (the sushi blade, pizza, boba, the koi, the sakura branch, the skewers,
  NIGHT CITY), most signs were shrunk by 8%, and orphaned comments in statics.js were removed. Measured 894.9.
- Renderer: 400 -> 401 KB for `_slick` and the blinking lights. Measured 400.6.
- The page is untouched.

**Tests.**
- test/neonstrip.test.js (new, under the heavy lock) checks on World v3:
  - every string's ends against the map;
  - the signs: at least 24 designs, the owner's named ones present, spread out, none twice on a front or side by side;
  - the two walkways: paved between walls, lanterns over them, always passable;
  - the flagship: one, its door onto its floor, more cabinets than any other arcade, the long counter;
  - no solid prop on the Strip's roads, and the doors onto the street.
- test/neonart.test.js (new) checks:
  - every picture decodes, with tubes lit and never the whole sign;
  - a front's signs and dressing don't overlap and nothing over 210 is blown out;
  - a back's shutter has its sign beside it;
  - the posts, brackets and lanterns are drawn.
- test/arcade.test.js gains "one balance at every arcade": tickets won at a corner arcade are spent at the flagship's
  counter, and the flagship's floor has its cabinets and counter and is reachable from the door.

**Also fixed.** One of Harbor Lights' lamps stood on Harborview Avenue (the new road check found it). It now stays off
the avenue.

**Checks.**
- Before and after shots, day and night: the area shots (tools/area-shot.mjs) at district and street scale, and in-game
  shots at 1280x720 and 390x844, are in scratchpad/b6a-shots/before and after.
- Under the heavy lock, these all pass: world3server 13/13, world3world, world3townmodels, world3scenes 6/6,
  world3shops 3/3, world3clutter 4/4, mapwindow 12/12, perf 6/6 and neonstrip.
- Light tests pass: arcade, neonart, worldbuild, pinkmile, arts, shoprooms, homeart, homewalls, dmath and devtp.
- perf: page 498/498, renderer 401/401, bake 895/895 KB. Building the city is 28x (budget 40), the bakes 60x (90).
