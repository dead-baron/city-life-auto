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
