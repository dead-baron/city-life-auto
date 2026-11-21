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
- [x] Small briefs / panties: the triangle is right, but a visible strap round the hip holds it up (not a bare V). - 18:10 below.
- [x] Bras from the side: straps round the shoulder / the body where they're missing. - 18:10 below.
- [x] Sports bra: one thin line today - thicker, shaped. - 18:10 below.
- [x] Bikini top: two pixels - more detail, shaped, still a bikini top. Bikini bottoms: a strap round the hip too, not bigger. - 18:10 below.
- [x] New: striped panties and striped underwear in general. - 18:10 below.

## Stripes
- [x] Stripes drawn as one horizontal line at any angle don't work (many pieces): rework how stripes are drawn. - 18:54 and 19:06 below.

## Small things that don't read (size up)
- [x] Glasses and sunglasses, all of them: the next size up (square, rimless, browline named). Eye patch: more detail. - 19:23 below: the frames drawn a size up; the eye patch a full patch.
- [x] Necklaces (1 px, or not drawn): a pixel more. Tiara (one pixel). Bow tie. Stethoscope. - 19:23 below. A pearl necklace on a white top still does not show (white on white).
- [x] Party mask, medical mask, face bandana (a train robber / an anarchist). Gas mask: more detail. - left as they are: judged readable at the new size. To look at with him. REDONE 20:15: each a picture in art pixels.
- [x] Pig, clown, skull, alien, masquerade, welding masks: more detail, bigger if needed. Bear and panda masks: ears, markings. - bear and panda done (ears, muzzle, eye patches); the other six left as they are - to look at with him. REDONE 20:15: all ten.
- [x] Glow bracelets and the lanyard go all the way round. Smartwatch: one wrist, right round it (shows from behind). - 19:23 below.
- [x] Knee pads and elbow pads from behind: a strap round, or the pad on the elbow. - the pad goes all the way round the joint.
- [x] Camera: you can't tell it's a camera (a strap only). - a camera body on the strap now; still small - weak. REDONE 20:15: on the chest from its strap.
- [x] Guitar case: hard to tell what it is. Backpacks and duffel bags too small (the duffel didn't draw?). Tool bag too small. - 19:23 below.
      Things held bigger in general.
- [x] Earmuffs: not seen (under the hair?) - over the hair, bigger. Headphones too (a piece exists: check it). - 19:23 below.
- [x] Bib overalls: the straps don't join at the back. - a panel joins them at the back.

## Hats
- [x] Top hat: level on top, more of a box (reads as a London police helmet). - 19:23 below.
- [x] Fire helmet doesn't read as one. - 19:23 below.
- [x] Visor: a single line - a real bill, and it wraps the head. (Today's makes a good headband.) - 19:23 below.
- [x] Cap backwards: two white lines at the back, no bill. - 19:23 below.
- [x] Turban: one blob - show the wrap. - 19:23 below.

## Clothes
- [x] Button-up shirt: subtle buttons? - 19:23 below.
- [x] Tactical vest: too small to make out. - 19:23 below.
- [x] Ghillie suit: vegetation - grass and plants coming off it. - 19:23 below.
- [x] Founding Citizen jacket: all gold, not the sleeves only; a full bomber-style jacket that shines and sparkles - a - 19:23 below.
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



## 19:23 - "I think it looks great ... Can we get a big batch going of the rest of the work we have planned for characters and NPCs?"
Stripes passed; on the striped bra and panties he is "not sure it works well ... leave it as is for now". The batch, each piece against the wardrobe snapshot (53 pieces changed, the ones aimed at and their families):
- [x] Sizes up: glasses frames, chains and necklaces, the lanyard (a card on it, round the collar at the back), the stethoscope (a silver bell), watches and bangles right round the wrist, bow tie, tiara, pads round the joint, things held in the hand.
- [x] Masks: bear and panda - ears, a pale muzzle, a nose; the panda its eye patches and black ears.
- [x] Hats: top hat a box with a level lid; fire helmet with a crest, a neck brim and a shield; visor a band round the head with a bill; cap backwards with its bill behind; turban with crossing folds and a knot; earmuffs and headphones over the hair with a band.
- [x] Bags: backpack and hiking pack bigger with a pocket; guitar case in the shape of a guitar; tool bag bigger with a handle; the duffel is drawn (it was not). Bib overalls joined at the back.
- [x] Clothes: buttons on button-up shirts (one art pixel each, every second row); tactical vest a plate carrier with pouches; ghillie suit with tufts standing out of it; the Founding Citizen jacket a gold bomber with dark ribbing, glossy, with pixels that catch the light.
- Left, and said so: the camera is still small; party / medical / bandana / gas / pig / clown / skull / alien / masquerade / welding masks unchanged; the scarf still reads as a necklace; a pearl necklace does not show on white.
- Shown: `characters-wardrobe-batch2-before-after.png`. Not yet seen by him.

## 20:15 - his look at batch 2 (`characters-wardrobe-batch2-before-after.png`)
"Is it bad to raise the bake code? I feel like we should raise it?" - raised, 1045 -> 1080 KB. "We should do the weak or left alone parts too right? Is there a reason we didn't do that?" - no good reason; done below.
- [x] Lanyard, gold chain, stethoscope "still too thin to recognize" - pictures in art pixels hung from the collar: a chain five across and two thick at the bottom; a lanyard's cord down to a card; a stethoscope's two tubes with a silver bell and earpiece.
- [x] Bow tie "bigger so it actually looks like a bow tie" - five across, three tall, two wings and a knot.
- [x] Buttons "centered on front view and run all the way up" - the middle column of the front, from the collar down, every second row.
- [x] Founding Citizen jacket "grey pixel on back in center top" - its collar is the ribbing's dark. "Zipped up, or an option" - zipped, a zip down the front. OPEN: the open / zipped choice itself.
- [x] Round glasses "too close together ... one step bigger so it looks like an actual round lens" - each lens two art pixels wide with its rim; the bridge between the eyes. Square, browline, rimless and half frames the same width.
- [x] Bear "the snout from the angle"; panda "missing nose in front view"; "ears could be bigger" - a short pale muzzle with the nose and mouth drawn on it; a panda's white eyes in black patches and a nose; ears a third bigger.
- [x] Turban "should look wrapped" - a fuller volume, the layers' folds rising to a point over the brow, the under-wrap showing in a peak there.
- [x] Cap backwards "more definition for the bill", no logo, "a little gap ... where the adjuster is" - the bill longer and darker behind, no logo, an arch over the brow.
- [x] Top hat "the white ring looked better ... make sure the top part is flat" - the round crown, taller, cut off level under a dark lid; the white band a ring round its foot.
- [x] Tiara "a little bigger ... back view doesn't look like anything" - a silver band over the hair from ear to ear, three points and the stone in front.
- [x] Earmuffs "maybe too big now"; headphones "probably better before" - both smaller, set outside the hair. Shown on a bald head too.
- [x] Tool bag "looks like a purse almost" - a tool box carried by its handle in the hand, tools standing out of it.
- [x] Duffel "a strap over the shoulder and be much bigger" - a long round bag behind the hip, a strap across the chest and the back.
- [x] Guitar case "the actual size of a guitar" - from the back of the knees to over the head.
- [x] Backpack "straps still get kind of lost" - a whole art pixel wide, in the pack's color, down to the ribs.
- [x] Camera "still not big enough" - on the chest from its strap: a silver top, a dark body, the lens.
- [x] The ten masks left alone: party and masquerade (a band across the eyes, eye holes, trim at the tips, bigger feathers), medical (the lower face, ear loops), face bandana (dotted), gas (lenses, one canister), pig (ears, a snout with nostrils), clown (red nose and mouth, tufts of hair), skull (sockets, nose, teeth), alien (bigger slanted eyes), welding (a green glass).
- [x] Scarf reads as a scarf (a band at the collar, a tail down one side, a line on the nape); pearls show on white as beads.
- Weak still, said so: a pearl necklace on a white top is faint; the bolo tie is small; a bow tie loses a pixel on the narrowest chests.
- Shown: `characters-wardrobe-batch3-before-after.png`. Not yet seen by him.

## 20:53 - his look at batch 3
- [x] "Let's do a zipper and unzipped version and give players the option" - Front: Open / Zipped (Buttoned on coats, cardigans, blazers) in the creator and the shop, kept in the look's code.
- [x] "Is there a reason not to raise the render budget? If not lets raise it." - none; 470 -> 510 KB.
- [x] The bear's "snout at an angle might need more polish" - the muzzle a pale block with the nose on it, a step toward the way the head faces, its tip out past the face in profile; the eyes plain dots.
- [x] "Scarf doesn't look like a scarf yet" - wound round the neck two rows thick and wider than it, one end down the front two wide, ribbed.
- [x] Bow tie "comically large ... one step bigger" - eight across on a man's chest, pinched at the knot.
- [~] "Go ahead and start on all of it we are missing" - the first 24 of the 77 missing concept items built (`docs/characters/CHECKLIST.md`: 536 in, 53 missing). Shown: `characters-missing-batch1.png`. What is left is listed in the DEVLOG entry of the same hour.

## 21:55 - his look at the missing pieces' first batch ("Keep on building!")
- [x] "Bear mask at an angle could use work" - the muzzle one pale tone, longer, the nose at its tip when the head is turned.
- [~] "Scarf should go around the neck better" - snug under the chin, five across and two rows thick, the tail from under it. The neck itself is hidden by the chin from the game's camera: this is as near as the wrap gets without covering the mouth. To look at with him.
- [x] "Necktie could be more tie shaped" - two wide, a darker knot, pale stripes slanting down it, the tip cut on the slant.
- [x] "Not sure what braces are do you mean suspenders? They are missing from the angled view" - renamed Suspenders; turned three quarters, what hangs on the far half of the chest is drawn a column nearer the middle, so the far strap shows (chains and straps too).
- [x] "Cravat ... probably dont need this as an item by itself" - taken out.
- [x] "Sleep mask is very thin it could be bigger" - three rows: brow, eyes, the tops of the cheeks.
- [x] "Riding helmet could look cooler" - glossy, a dark peak, a band of the trim over the crown, a harness strap down each cheek.
- [x] "cant really tell they're goggles" - worn over the eyes: two lenses two art pixels square in a dark frame, their strap round the helmet.
- [~] "Newspaper doesnt really look like a newspaper" - a bigger folded sheet with a dark headline bar and lines of print. Still a few art pixels at the hand.
- [~] "Basketball does not look like a basketball" - a deeper orange (its lit tone was the skin's), a seam down and one across, held higher. Still half behind the arm from the front.
- [x] "Keep on building!" - the second batch: 21 more of the missing items (`characters-missing-batch2.png`).

## 22:19 - his look at the fixes and batch 2 ("Lets keep it going! ... finish everything missing and make sure all notes are accounted for")
- [x] "Basketball should be more spherical" - held against the chest with the forearm across, all of it in view; a deep orange with one seam.
- [x] Goggles "doesnt look right still, it also doesnt cover eyes on the angled view" - shapes now, not stamps: a dark frame across the eyes, a lens standing out over each, from every side.
- [~] "The scarf still isnt right it needs to wrap around the neck area" - up over the jaw's corners either side of the chin and across under it, then the wrap and the tail. To look at with him.
- [x] Necktie "one pixel on each side ... and pointy at the end" - four wide at the front, a knot, slanting stripes, a point.
- [x] "Sleep mask is weirdly shaped in the front view and seems off in the angled view" - one plain shape: a band over the eyes, a pad over each cheek, the nose between.
- [x] "Bear mask has white in the eyes on angled views but no white in the front view" - the eyes' whole row is the mask's color first, from every side (pig and chicken too).
- [x] "T shirt dress and jersey dress have skin pixels showing through (I thought we were doing checks on this to make sure)" - the check dressed its figures in one outfit. It now puts on every piece of the wardrobe from six sides (`tools/bodycheck.mjs` wardrobe(), a test): about 170 such pixels on 60 pieces at the start - skirts and dresses, the thigh under a jacket's hem, a shirt showing through a jacket's opening at an angle - 6 left, named in the test.
- [x] "Please make sure all animations work well" - every one of the 68 poses renders with every accessory, jacket and pass-only piece (28,152 renders, none failed; a test for the pass's pieces); a sheet of 25 poses in a tie, a pack, glasses and a cap looked at. Not done: watching them move in the running game.
- [~] "Make sure all customizations and everything are in" / "finish everything missing" - 12 more concept items: 568 in, 20 missing (below). A carrying pose for things held to the chest (newspaper, clipboard, laptop sleeve, basketball).
- Missing still, and why: a bodybuilder build (built, then taken out: the underwear's cut breaks on it); a stoop, two-tone hair, a hair length slider, a beard's own color (each needs a new field in the look's code); waves, a faux-hawk, a loc updo, a receding hairline, pin curls (each a hair shape of its own); a wig; a coat on the shoulders; a peeled wetsuit; a hood's fur trim; harem trousers; a crochet cover-up; a polka-dot bikini; a surfboard to carry; roller skates, dogs on leads, a bike with a basket (world things).
- Notes still marked [~] above this section, for him to look at: the party / medical / bandana / gas masks and the pig, clown, skull, alien, masquerade, welding masks (all redrawn at 20:15 - these two lines are answered); the camera (on the chest since 20:15 - answered); the big woman's neckline pixel from the side; the slim woman's arm from behind.

## 23:27 - his look at the 22:19 fixes (`characters-fixes-2327.png`)
- [x] "I cant see any of the moustaches are they the wrong color or something?" - both: decided a world pixel at a time they baked to a dark pixel or two, and in the hair's base color, which is darker than the hair looks (most of a head of hair is its lit top). All sixteen styles are pictures on the art grid now, in the tone the hair above them shows: a moustache is a bar under the nose with a row of skin between it and the eyes; a beard runs from one edge of the face to the other. A blonde one darkens toward brown, not olive.
- [x] "Bear mask still has white on the eyes for angle views but no white in front view" - the cause was the face, not the mask: turned three quarters, one eye sat an art row lower than the other, so the mask's eye row covered one and left the other's white. The two eyes are on one row now, on every build (a test), and an animal mask covers an eye that still isn't.
- [~] "Maybe sleep mask color is blending in with skin but it looks off right now" - navy on a dark fringe was no shape. Lavender by default, lit along its top, a strap pixel into the hair each side. It may still read as a visor: to look at with him.
- [x] "Jersey dress has white pixels in the middle that should look better" - the number was a grid finer than an art pixel. It's a 7 now, three wide and four tall, front and back (the football, MX and cycling jerseys too).
- [x] "Basketball should be a sphere not this current shape" - on the palm out in front of the hip with nothing over it, five art pixels across, its middle on an art pixel's middle so it's the same round disc from every side, two seams crossing. From behind, where only a pixel of it would show past the body, it isn't drawn.
- [x] "Scarf goes around face on angle view but below it in front and other angle view" - nothing of it on the face any more: the same wrap round the neck from all eight sides, in one flat red (its two-tone ribs were the pink), an end down the front, a band across the nape from behind.

## 11-21 01:03 - his look at the 23:27 fixes
- [~] "Scarf really isn't working... let's ditch it unless we can get it right this next round. It should just bunch up around the neck and maybe cover the bottom of the face over the mouth and wrap all the way around and dangle down a bit on the chest like scarves do." - no longer a picture on the chest: a shape - a roll round the neck as wide as the head, up over the chin, an end hanging down the chest with a darker band at its foot. The same scarf from all eight sides, over a tee, a coat, a hood, a beard. **His look decides whether it stays** (`characters-scarf-beards-0103.png`).
- [x] "Moustaches and beards, there's a few okay ones like handle bar moustache but otherwise they're not looking great ... a bigger beard and obvious facial hair we should go for it but otherwise it might not be worth it for some of these that don't show anything at all or anything visibly clear." - eight stay, drawn to be seen: stubble (a shade over the jaw), a short beard (the lower face in the beard's tone), a full beard (that, and a mass of hair under the jaw), a long beard (down the chest), a goatee (moustache, chin and a tuft under it), a moustache, a handlebar, mutton chops (standing off the cheeks). A chin strap, a soul patch and a Van Dyke are drawn as the nearest of those and the creator doesn't offer them while the pass is on; the five added on 11-20 are taken out. A blonde beard on tan skin is still low in contrast - that's the colors, not the shape.

## 11-21 01:31 - "do everything left for the character/npc characters and work until it's done"
- [x] "Handlebar mustache looked better before but just want to make sure it looks okay to an angle and side" - the front view was pixel for pixel the same in both rows of the 01:03 sheet. What was weak was the angle (a short bar under one eye) and the side (one pixel): at three quarters it is one bar on the mouth's row with skin between it and the eyes, from the side three pixels from the lip back.
- [x] The concept checklist: nothing missing any more (580 in, 20 too small, 8 dropped). Built overnight: Harem trousers, Wetsuit peeled to the waist, Fur-hood parka, Coat over the shoulders, Surfboard, Crochet cover-up, Roller skates, Party wig; the hair shapes Waves, Faux-hawk, Loc updo, Receding, Pin curls; Dyed tips, a Beard color, a Posture (stooped), a Bodybuilder build. Sheet: `characters-overnight-1121.png`.
- [~] Weak ones on that sheet, to look at with him: Receding and the Faux-hawk are small changes at the game's size; the cover-up's crochet doesn't show (it reads as a cream dress); the parka's fur is a thin line; the roller skates' wheels are two pink pixels; the clipboard is small.
- [x] The NPCs under the pass: all 17 civilian recipes and 29 street personas, several looks each, from six sides and in all 68 poses - every one draws (3,128 pose renders, none failed). 19 lone pixels of skin in 2,268 sprites, all of them skin that is really there (a shoulder between a vest and a chain, a belly under a short tank top, a strapless dress). A test holds it. Sheet: `characters-npcs-under-pass.png`.
- [x] In the running game with the pass on (a local test copy, headless): the starting looks, the creator's Hair tab (eight facial hair styles; the three retired ones not offered), the jacket's Front option (zipped in the preview), the Outfit tab's patterns, arriving by train and walking a street at noon. Captures: `characters-in-game-1121.png`. NOT watched: animations frame by frame, a blink as it happens (a test checks the shut-eyed sprite instead), a phone or the Xbox.
- [~] Left as they were, with reasons: the six allow-listed lone pixels and the trench coat's hem pixel (a rule that would close them moved 87 other figures by a pixel each - taken back out); the big woman's neckline pixel from the side and the slim woman's arm from behind (his call, as noted above); the sleep mask (may still read as a visor); blonde facial hair on tan skin (low contrast).
- To start the test copy the way the repo's benchmark tools do, the headless browser's profile is given the "Before you play" answer in storage (13+, essential only - analytics off). Nothing was accepted in a real browser or on the live site.

