# Today's people: a critique (2026-11-19, before the polish pass)

Written before changing anything, from `before.png` (eight people - men and women of every build - four facings,
standing and walking, at game scale and 4x), the same eight on the grounds they walk (`grounds.png`, top rows), heads
close up (`faces.png`, "before" rows), and the owner's concepts in `concepts/` (C1, CB1-M, NP1-A looked at point by
point; the rest are the same hand). Sheets: `node tools/charsheet.mjs before | grounds | faces`.

What a figure is today: about 21 art pixels tall (42 px on screen at zoom 1), the bare head 8 wide and 8 tall, 10 with
hair - **about 2.6 heads tall bare-headed, 2.2 with the hair**. The body under it is 12 art pixels for a chest, hips,
legs and feet.

## What's wrong, ranked by how much a player notices

1. **A head on a block: no neck, no shoulder line.** The head's lower third sits *inside* the shoulders (the chin is
   below the shoulder tops), so head and body are one outline. From the front the silhouette is a keyhole; from the
   side and from behind it is a thumb. This is the "blob" the audit named, and it is the first thing seen at game scale.
2. **The head is too big for the body; the legs are stubs.** Legs and feet get 5-6 art pixels, the hips start right
   under the chest. A walk moves two or three pixels of leg, so walking reads as a shuffle and running barely reads as
   different from walking. Every build shares the problem, so builds differ only in width.
3. **No face.** An eye is one art pixel, and its colour is taken from the iris mixed toward the skin - on tan and dark
   skin it is nearly the skin's own shadow colour (see `faces.png`: eye columns 3-6). No brow is visible on most looks
   (brows are drawn in the hair's colour at half strength, on the row the fringe already covers). The nose is one pixel of
   slightly darker skin; the mouth one faint pixel. At game scale the face is a flat skin-coloured disc: you cannot tell
   where someone is looking, and the creator's six eyes, six brows, six noses and six lips all look the same. Sunglasses
   are the only thing that reads - which is why NPCs with shades look "better".
4. **Which way someone faces is carried by the hair alone.** With no face, no neck and no chest/back difference, a
   figure facing S and one facing N differ by a few pixels of skin under the fringe. From the side (E) the face is a
   two-pixel sliver with no nose or chin: the profile is a circle.
5. **Arms merge with the body; hands vanish.** The upper arm is as thick as a thigh and hangs touching the chest; in a
   dark top (the suit, the hoodie, the police uniform) the arm, chest and hip are one black mass with the inner outline
   lost. A hand is 1-2 art pixels of skin that is often hidden by the hip or cut off by the outline; a hand in a dark
   glove or at the end of a dark sleeve is not there at all. What someone holds floats beside a blob.
6. **A man and a woman differ only by hair.** The woman's body is the man's at 0.9 width: no waist, no hip, the bust
   one pixel that the top's shading swallows. A woman with short hair or a hat is a small man.
7. **Builds: wide or not wide.** Slim, average and athletic differ by one art pixel of width. Athletic reads as "fat
   with a tank top" - no shoulder-to-waist taper, no chest. Curvy reads as big. Big is the only build with its own
   silhouette (the belly).
8. **Dark outfits are holes; warm skin is a glow.** The black suit, black hoodie and navy uniform shade across two
   ramp steps that the dither turns into noise; no lapel, belt or leg separation survives. Bare skin (tank tops, shorts,
   swimwear) is one saturated orange for arms, chest, belly and legs alike: the curvy woman and the athletic man are
   orange shapes. At night (`grounds.png`) the dark outfits disappear into the ground and only skin and hair remain;
   on sand the skin merges with the ground instead.
9. **Hair is a cap or a spike.** Styles keep the head's outline (short, slick, buzz, bob), or add one cone on top (bun,
   topknot, pony, mohawk) that points straight up like a party hat. Long hair doesn't fall past the shoulders in front
   view because there are no shoulders to fall past. The fringe line is ragged dither, not a hairline.
10. **Animation.** The idle is still (a breath moves nothing at this size). The walk's leg swing is 2-3 pixels and the
    arms swing inside the body's outline, so from N and S only the feet change. Nothing bobs: the head stays on one row.
11. **Role tells.** A cop is a navy blob with a cap: no badge glint, belt or light shirt to set it apart from a navy
    hoodie and beanie at a glance. (Not in this pass - noted for the clothing pass.)

## Against the concepts (C1, CB1-M, NP1-A)

| The concepts show | The game today |
| --- | --- |
| A short but visible neck: the chin clears the collar, shoulders start below it | The chin sits inside the shoulders |
| A square shoulder line wider than the head, arms hanging *off* it with a gap of outline to the torso | Round shoulders as wide as the head; arms fused to the chest |
| Fists: a 2 x 2 pixel hand in a lit skin tone at the end of every arm, outlined, clear of the hip | Hands hidden, clipped or missing |
| A face: a dark brow line with the eyes right under it (2 pixels each, dark, the light catching above the cheek), a nose shadow, a mouth | One-pixel eyes in a skin-like colour, no brow |
| About 3 heads tall, the legs a third of the height, feet big and planted apart | 2.2-2.6 heads; legs a quarter |
| CB1: six builds told apart by silhouette - shoulder width, waist, arm thickness, belly | Width only |
| C1 row 2: a woman's narrower shoulders, waist and hips, in the same tee | The man's body, narrower |
| Hair as a mass with a clear outline and a lit top plane; a ponytail that hangs | A cap following the skull, cones for tails |
| A dark outline all round and *between* parts (arm over body, chin over shirt) | The outer outline is there; inner ones are lost on dark cloth |
| NP1: walks with a body bob, arms swinging clear of the body | Feet only |

What the game already does as well as the concepts: the palette and ramps, the outer outline, the cast shadow, hats and
glasses (they read), every pose turning through all eight facings with the same volume, and outfits that keep their
colours. None of that needs replacing - the polish is proportions, the neck and shoulders, hands, and the face.

## What the pass should fix (and in what order)

1. Proportions: a smaller head on a longer body (the brief: 3.5-4 heads), longer legs.
2. A neck and a shoulder line; arms that hang off the shoulders.
3. A face on the art grid: eyes that are dark enough to be eyes on every skin, brows, a nose shadow, a mouth; a profile.
4. Hands that are always there.
5. Builds and the two bases told apart by shape.
6. Left for later passes (the owner's order: faces, then hands/arms, then clothing): dark-cloth detail, role tells,
   hair silhouettes beyond what the new proportions give for free, the walk's bob.

## Re-checked against `after.png` (the pass switched on)

| # | Issue | After the pass |
| --- | --- | --- |
| 1 | No neck, no shoulder line | **Fixed** from S, SE and E: the chin clears the collar, shoulders start below it. From N the hair still covers the neck on most styles |
| 2 | Head too big, legs stubs | **Better, not what the brief asked**: about 3.1 heads (from 2.4), legs 20% longer. 3.5-4 heads is a choice for the owner (`NOTES.md`, `variants.png`) |
| 3 | No face | **Fixed** at 4x and on `faces.png` for all 16 skins; at game scale the eyes read, brows and mouth are faint |
| 4 | Facing carried by hair alone | **Better**: the eyes show S and SE, a profile has an eye and a mouth. N against S is still hair against face |
| 5 | Arms merge, hands vanish | **Partly**: thinner arms hang off the shoulders and hands show on light tops; on dark tops the arm is still lost in the chest |
| 6 | Man and woman differ only by hair | **Better**: a waist and hips, narrower shoulders, coloured lips, a softer brow. Still close in loose dark clothes |
| 7 | Builds differ only in width | **Better** (`builds.png`): athletic is a V, curvy has hips, big has the belly. Slim and average are still close |
| 8 | Dark outfits are holes, skin glows | **Remains** (clothing pass) |
| 9 | Hair a cap or a spike | **Remains**: unchanged, though long hair now falls past real shoulders |
| 10 | Animation | **Partly**: longer legs give the walk a visible stride; still no bob |
| 11 | Role tells | **Remains** (clothing pass) |
