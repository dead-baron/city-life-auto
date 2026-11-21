# The owner's notes on the wardrobe sheets, 2026-11-20 13:33

From the three review sheets (every piece, front / angle / back, chunky build, soft outline). His words, shortened.
Tick each when it is done AND he has seen it. Branch `characters`; nothing here is on main.

## The rule behind most of them (a decision: DECISIONS.md)
Details one art pixel wide get lost. Accessories and small details may be **a pixel or two bigger than life** so they read
and "make a statement": glasses, necklaces, a tiara, a bow tie, masks, bags, things held. "It would be better to see what
things are ... than to have the details totally lost."

## Bugs and defaults
- [x] Paper hat: is it meant to make the character bald? (No - a bug: it sits on the hair now.)
- [x] "Nothing": no shoes (the sheet had put sneakers on it). The mosaic differs top and bottom: one style, over the hips and over the chest separately, like The Sims.
- [x] The set labelled "Underwear": default is a bra and panties (women), boxers (men); today's stays as another option.
- [x] Some hats show two black dots at the back (hair through the brim: fixed).
- [x] Jackets over bare skin read as "pants missing a top part" (the sheet: no shirt under them). All jackets are open; zipped as an option: AFTER THE BETA (the owner, 13:42).

## Underwear
- [ ] Small briefs / panties: the triangle is right, but a visible strap round the hip holds it up (not a bare V).
- [ ] Bras from the side: straps round the shoulder / the body where they're missing.
- [ ] Sports bra: one thin line today - thicker, shaped.
- [ ] Bikini top: two pixels - more detail, shaped, still a bikini top. Bikini bottoms: a strap round the hip too, not bigger.
- [ ] New: striped panties and striped underwear in general.

## Stripes
- [ ] Stripes drawn as one horizontal line at any angle don't work (many pieces): rework how stripes are drawn.

## Small things that don't read (size up)
- [ ] Glasses and sunglasses, all of them: the next size up (square, rimless, browline named). Eye patch: more detail.
- [ ] Necklaces (1 px, or not drawn): a pixel more. Tiara (one pixel). Bow tie. Stethoscope.
- [ ] Party mask, medical mask, face bandana (a train robber / an anarchist). Gas mask: more detail.
- [ ] Pig, clown, skull, alien, masquerade, welding masks: more detail, bigger if needed. Bear and panda masks: ears, markings.
- [ ] Glow bracelets and the lanyard go all the way round. Smartwatch: one wrist, right round it (shows from behind).
- [ ] Knee pads and elbow pads from behind: a strap round, or the pad on the elbow.
- [ ] Camera: you can't tell it's a camera (a strap only).
- [ ] Guitar case: hard to tell what it is. Backpacks and duffel bags too small (the duffel didn't draw?). Tool bag too small.
      Things held bigger in general.
- [ ] Earmuffs: not seen (under the hair?) - over the hair, bigger. Headphones too (a piece exists: check it).
- [ ] Bib overalls: the straps don't join at the back.

## Hats
- [ ] Top hat: level on top, more of a box (reads as a London police helmet).
- [ ] Fire helmet doesn't read as one.
- [ ] Visor: a single line - a real bill, and it wraps the head. (Today's makes a good headband.)
- [ ] Cap backwards: two white lines at the back, no bill.
- [ ] Turban: one blob - show the wrap.

## Clothes
- [ ] Button-up shirt: subtle buttons?
- [ ] Tactical vest: too small to make out.
- [ ] Ghillie suit: vegetation - grass and plants coming off it.
- [ ] Founding Citizen jacket: all gold, not the sleeves only; a full bomber-style jacket that shines and sparkles - a
      super premium item; a small VFX if it's cheap.

## Eyes (he asks for suggestions)
One-pixel dark eyes look good; a changed eye color gets lost. "Big" adds a white, which looks good. If eyes get more
detail, people should blink, or everyone stares.

## 13:42
- Eyes: options shown (`POLISH.eyeMode` 0-3, a blink frame: `person(..., { blink: 1 })`) - HIS PICK PENDING. Blinking for everyone wanted.
- Paper hat: was inside the hair's volume - lifted and bigger. Women's briefs: a strap row round the hip (HIP), the bra's band
  on round the side. From the side a hanging arm covers nearly the whole body on the chunky build: one art pixel of the bottoms shows.

## 13:56
- Eyes: he picks D (the color with a white beside it). Built: `POLISH.eyeMode: 3`, the six eye shapes on it. Blinking: to build
  (the frame exists: `person(..., { blink: 1 })`; the game has to ask for it - peds.js - standing and sitting first).
- Panties: the strap is the triangle's top row run across the hips (under4). A woman's chest and seat: a little fuller (people.js).
- The far arm's scrap behind the shoulder in a side view: folded into the outline.

## 14:38
- Blinking: "not on a loop that gets repetitive ... natural for players and NPCs"; eyes closed may be part of animations too.
  Built: peds.js `blinkAt` (each person's own irregular moments, a double now and then), host.js shows the shut-eyed sprite in
  still poses (`BLINKS`). NOT YET SEEN in the running game. Eyes shut inside emotes (a laugh, a yawn): to add with the emotes.
- The side view's eye: the white goes behind the color in profile (it had no room in front and vanished - "thin eye").
- Reminder from him: glasses a size bigger (the size-ups batch).
- Body: her upper back flatter (the bump behind the shoulder), the seat fuller "like the chest is". Good as it is otherwise.
- Straps must join their top: a tank top's and a swimsuit's are a whole art pixel wide now.

## 15:06
- The renderer's budget raised on his word (470 KB; the bake's 1045): tools/perf.mjs, DEVLOG, DECISIONS.
- A woman's side shape "is looking good"; the neckline over the bust comes in now (the bust lower and out, the chest over it set back).
- Shown across the five builds, women and men. A big build's belly stays bare between a bra and briefs (it took the cups).

## 15:20 - the women's builds (his notes on the body-type sheet)
- Slim: a pointy seat -> the seat is one broad curve on every build; a one-pixel point on the trunk is folded into the outline.
- Average: a spike at the chest, and the neckline (his red arrows) -> the bust lower and level, the row under the neck in.
- Athletic: arms too big -> "like average with a little more shape": the muscle's arm boost off for women, a touch more bust and seat.
- Curvy: "like athletic with slightly more shape", the underwear wrong from behind -> no belly, the waist in, the most bust and seat.
- Big: the stomach and back one huge circle -> the belly its own shape, low and in front (men's too), a bust over it.
- STILL WEAK: athletic and curvy in a bra and briefs from the front read busy (the two halves close together on a short waist).
- D.shape (peoplepolish.js dims) is how far the bust and the seat stand out per build.

## 15:28 - the women's builds, second round
- Big in underwear "does not look right": the waist was as deep as the belly at the back (a ball) - a flat back now, the belly
  lower and smaller, bare between a bra and briefs (it took the briefs' band too), the strap's row found robustly.
- Curvy "a spike coming out of her arm": the hand - a fist bigger than its thinned arm. Fists scale with the limbs and are
  capped at a third over the wrist; a one-pixel point of an elbow or a hand at the side is folded into the outline.
- Slim "one pixel high" seat: three art pixels tall now. Athletic: the neck without the muscle's thickening.
- Left: a small point at the hand in curvy's angle view.

## 15:36 - the builds, third round (his notes on women's backs and the men)
- Women from behind, all builds: "the legs don't go all the way up" - the taller seat hung over the tops of the legs. Cut level with the pelvis.
- Curvy: more definition to the bust (D.bust). Big (women and men): the belly a tall shape cut top and bottom - a round front, not a point.
- Men: slim's chest bump and athletic's pointy chest - the chest no more than half a pixel in front of the waist; average's
  neck - the head a pixel higher; big's points on the shoulders from behind - an upper arm's one-pixel top folded into the outline.
- Checked: with the pass OFF the renderer draws exactly what pass 5 drew (240 sprites, scratch `offsame.mjs`) - worth a test.

## 15:49 - "is there a better way ... so we nail it down this time" - the bodies, measured
His list, and where each stands. All of it is now a rule in `tools/bodycheck.mjs` (run by `test/bodyshape.test.js`), which finds nothing on 160 standing and 640 walking figures.
- [x] Men slim / curvy: chest bump - one-pixel bumps on the trunk are folded into the outline; a curvy man has no small belly.
- [x] Men average / athletic: no neck from the side - the head a pixel higher; where a build's jaw still ran out over the chest, the jaw's lowest front pixel goes (people.js, the side-view neck rule).
- [x] Men athletic: two bumps at the bottom of the underwear - a boxer's hem is one level row.
- [x] Men's shirts: a V at the bottom - the hem is level on the screen and on the art grid, waist and pelvis alike.
- [x] White shirts and skin: shade lines too dark - lines about three quarters of the color under them (were under half), lighter on pale cloth, warm on skin; one-pixel lines dropped; shading tidied so no art pixel is alone in its tone.
- [x] Men big, front: skin pixel in the middle of the underwear - rows run unbroken; the thigh's inside is the boxer's too.
- [x] Women: legs not apart all the way, front and back - the line between the legs runs up to the underwear (checked as a rule).
- [x] Women big, front: no underwear - the briefs' rows run across the belly.
- [x] Eye disappears at an angle - the colored part is drawn after the whites (checked: two eyes at every front angle).
- [x] Strap a "+" at an angle; straps missing on big and slim, front and back - a strap over each cup or up from the band, whatever the build; from behind the bra is a level band with two straps.
- [x] Women slim: big feet, lost legs, "a big step back" from the front - slim is now an average build an art pixel narrower; feet scale with the legs.
- [x] Women: the shape in the seat from behind - the seat no longer shows between the thighs or under the briefs.
- [~] Women big, white shirt: extra pixel on the neckline from the side - the neck now has a row set in from chin and chest; the pixel he saw may be the bare skin above the scoop. To look at with him.
- Left, and said so: from the side an arm hangs over most of the hip, so underwear shows as a patch in front of and behind it; at an angle the far hand shows as a small nub on the wide builds; kneel / punch lose an eye at some angles.

## 16:51 - his second look at the checked sheets ("WAY better ... can we isolate these fixes?")
Each fix made against a snapshot of every figure; what it touched is in the DEVLOG entry of the same hour.
- [x] An extra line on her leg (slim, three quarters behind); dark shading in the crotch (slim, angled); weird shading (curvy, angled) - lines on bare skin are the skin's own shade now, a leg's too.
- [x] Straps missing, swimsuit not showing correctly (athletic, angled front and back); straps not working on big from behind and at an angle - a band across with a strap up from each end; straps up to the shoulder from behind.
- [x] Arms / hands way too long from the side - the near arm lifted in profile; checked against the front view on every build.
- [x] Extra white pixel on the neck (big, side); white pixel (average, side); a few extra white pixels (slim, average, side); a skin pixel in the white shirt (athletic, side) - the tank top's profile rule.
- [x] Extra skin pixel between the thighs under the swimsuit (slim, front) - bare legs stay two apart up to the underwear.
- [x] A pixel sticking out on the head (men slim, side) - short hair's one-pixel bump at the back.
- [~] Arm shape weird on the slim woman's back - softer lines only; the shape itself kept (changing it changed her from every side). His call.
- [x] The outer outline "really dark" - three strengths sent; he picked A, the one in place (17:44).

## 17:44 - "overall its looking really great ... call it good at this point and move on to everything else"
- [x] A random blue pixel / a random white pixel (men, three quarters) - a thigh's top over the hem line is under the shirt.
- Outline: A (as it is). Bodies: passed. Next: the wardrobe notes above, in the order of the queue.

## 18:10 - wardrobe notes, batch 1 (after the bodies were passed)
- [x] Sports bra "one thin line" - a band with broad straps, cut on the art grid.
- [x] Bikini top "two pixels" - two cups with straps. Bikini bottoms - a triangle with a strap round the hips, in its own color.
- [x] "Add striped panties/underwear" - Striped boxers, Striped briefs, Striped bra and panties (new pieces, the catalogue's last three).
- Shown: `characters-wardrobe-batch1-swim-and-stripes.png`. Not yet seen by him.

## 18:54 - "the stripes are still drawn perfectly horizontally ... is that still an option?"
- [x] Stripes follow the garment: rings round the trunk (a slight dip in front, a slight lean at an angle), rings down the sleeves and legs at the limb's own height. Rugby shirt, Striped tee, Breton top, Pajamas, Poncho, the striped underwear. Shown: `characters-stripes-before-after.png`. Not yet seen by him.

## 19:06 - "thicker in places and thinner and not complete in others ... make the full stripe connect all the way around"
- [x] Stripes laid on the art grid: one art pixel thick, joined from one side of the part to the other, a test for it. Shown: `characters-stripes-v2.png`. Not yet seen by him.

