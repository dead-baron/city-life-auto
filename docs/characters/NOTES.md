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

---

# Pass 2 - notes (2026-11-19): the concepts, underwear, every animation

The owner chose **proportions A** (choice 1 above is settled). Pass 2 is the task in `docs/tasks/CHARACTERS2.md`.
Start with `CONCEPTS.md` (the 94 concept images, one line each, and the gap list), then the sheets in `pass2/`.

**What is live on merge and what is staged.** The drawing is behind the same switch, off: with it off, every look that
exists today draws pixel for pixel as before (`test/peoplepolish.test.js`). The **wardrobe is not behind the switch** -
it is data the server keeps: the underwear slot, its 17 pieces, "Nothing on", the 28 concept pieces and the new
*Censored nudity* setting are in the game as soon as the branch is merged, drawn by today's renderer (plainer: no
waistbands, lace or reflective bands until the pass is on). The six new hairstyles are offered only while the pass is on.

## The sheets (`docs/characters/pass2/`, all from `node tools/charsheet.mjs <mode>`)

| File | Mode | What it shows |
| --- | --- | --- |
| `vs-C1`, `vs-C3`, `vs-CC5-B`, `vs-SM12`, `vs-SF12`, `vs-SF23-A`, `vs-SM23`, `vs-CB3-M` | `versus` | The concept image, then matching looks: pass 1 over pass 2 |
| `anim-1` .. `anim-7` | `anim` | Every pose (63), eight facings and more frames, pass 2 on |
| `grounds.png` | `grounds2` | The eight and three dark outfits on pavement, cobbles, asphalt, grass, sand, leaf litter, at night (plain and busy) and in rain: pass 1 over pass 2. Flat or speckled colours and a tint - not the game's lighting |
| `lineup.png`, `lineup-npc.png` | `lineup` | 21 uniforms and job looks, pass 2 over pass 1; the city's 22 archetypes as the server dresses them, pass 2 |
| `underwear-1`, `underwear-2` | `under` | Every underwear piece on both bases: S, SE, E, N, walking; the pass off; *Censored nudity* on |
| `hair.png` | `hair --on 1` | All 42 hairstyles with the pass on, front quarter and from behind |

## What pass 2 changed

With the pass on (`client/art2/peoplepolish.js`; `people.js` got four small hooks: `PL.dress`, `PL.post`, `PL.hair` /
`PL.hairCut`, and the mosaic's patch from behind):

- **Dark clothing reads.** A dark cloth's five-step ramp is lifted step by step to the lightness the concepts paint
  that step (black comes out a warm charcoal: 48 / 77 / 113 where it was 26 / 54 / 83), in the cloth's own hue (navy
  stays navy). The shadows stay dark, so folds, lapels and pockets show. A line is drawn on the body beside an arm
  that hangs in front of it, however small the step in depth. A dark top over dark bottoms gets a lit waist line; a
  dark shoe's sole is lifted with it.
- **Uniforms.** The police: the badge two art pixels of gold, a shoulder patch in the trim colour, a gold buckle on the
  black belt. Plain work uniforms (chef's whites, the postal shirt, the paramedic's) lose the badge and the holster
  they were drawn with. Reflective bands round the chest, the upper arms and the shins on the paramedic uniform, the
  turnout gear and the hi-vis coverall.
- **Underwear** drawn finer: briefs that are full and cut at the leg, a waistband in the trim colour, boxers a little
  down the thigh, a sports bra a wide band, lace as the trim colour scattered through the piece, a sheen on silk.
- **The mosaic** on the new body: it follows the pelvis and the chest of the figure it is on (it always did), is
  stronger in contrast with the pass on, and with the pass on there is a patch from behind as well. Drawn standing,
  walking, sitting, kneeling, swimming and down (`test/characters2.test.js`); looked at standing and walking
  (`underwear-1.png`). At sprite size it is a few blocks of skin tones - it reads as a soft patch, not as a grid.
- **Hair:** six shapes the concepts have and the list lacked - Balding, Flat top, Pompadour, Afro puffs, Low ponytail,
  Side fringe.
- **Over the head:** speech bubbles and the marks over a head (the bounty skull, the flare) sit 4 px higher.

Always (the wardrobe):

- **The underwear slot** (the tenth; an "Underwear" tab in the creator and the fitting rooms). No piece picked
  ("Basic") is the plain white basics every look had. 17 pieces: Nothing on, Boxers, Briefs, Boxer briefs, Undershirt
  and boxers, Tank and briefs, Bra and briefs, Sports bra and shorts, Union suit, Silk boxers, Fitted trunks, Lace bra
  and panties, Bralette set, Strapless set, Lace bodysuit, Teddy, Silk slip - any colour, any trim, patterns. It shows
  where there is no top or no bottoms and never under clothes. A woman wearing a bottoms-only piece gets a plain bra
  with it. A new random outfit keeps the underwear you had on.
- **Nothing on** is free and may be worn anywhere; the mosaic covers it; *Settings > Censored nudity* (new, off by
  default) shows swimwear instead to whoever switches it on. The renderer could always do that, but nothing on the
  page asked it to: the setting did not exist until this pass. The city's people never fill the slot (600 random looks
  tested), and the bathhouses' own "Nothing" set is unchanged.
- A look with no underwear picked keeps its 66-letter code; with underwear it is 71. Old codes decode as before. A
  page still running the build before this one cannot read a 71-letter code (it draws that player's old-style stand-in
  until it reloads).

## Every concept outfit: already in, added, didn't fit

| Sheets | Already in the wardrobe | Added in pass 2 | Didn't fit / left |
| --- | --- | --- | --- |
| C2, NP1-2 (civilians) | Suits, polo, sports bra and leggings, waistcoat and bow tie, scrubs, cardigan, hoodie, apron, coveralls, hi-vis vest, studded vest, tracksuit, Hawaiian shirt, overalls, flannel, briefcase, shopping bags, coffee, backpack, crossbody, duffel, mail satchel | Lanyard, Headphones, Walking cane | Camera on a strap, shopping trolley, newspaper, dogs on leads (props, not clothes) |
| C3, CC5 (services, gangs) | Police uniform by rank, tactical vest, dress uniform and gloves, balaclava, bandana, trench coat and fedora, varsity and bomber jackets, chains, hard hat, delivery pack, lifeguard whistle and rescue tube | Paramedic uniform, Turnout gear, Fire helmet, Security shirt, Hi-vis coverall | Riot armour and helmet, the motorcycle officer's white helmet and striped trousers, a medical bag of its own (a red duffel stands in) |
| C4, CP1-CP4 (parts) | Every hat, pair of glasses, mask, piece of jewelry, bag and shoe on the four CP sheets was already in | - | Rings (too small) |
| CC3 (formal, street, beach, skate) | Three-piece suit, tuxedo, gown, mini dress, clutch, hoodie and joggers, denim jacket, ripped jeans, graphic tee, cargo shorts, bomber, swimsuit, sarong, bikini, sun hat, board shorts, beanie, flannel, checkerboard slip-ons, caps | Rash guard | Knee pads, tube socks, a wallet chain |
| CC4 (farm, biker, hunter, military) | Bib overalls, flannel, puffer vest, apron, work gloves, wellies, leather jacket, studded vest, moto helmet, field vest, flat cap, chest waders, camo as a pattern | Leather chaps, Camo jacket, Camo cap, Boonie hat | Ghillie suit (a shape of its own), a quilted jacket's sherpa collar |
| SF1-SF3, SM1-SM3 (fashion, office, smart) | Coats, turtleneck, suits, blazers, blouse, skirts, wrap and sheath dresses (as dresses), jumpsuit, polo, chinos, loafers, pumps, handbag, tote, briefcase, watch, sunglasses, beret | Scarf, Sweater vest, Camisole, Lanyard | Cape-coat, a coat draped over the shoulders, braces, pinstripes (a pattern we lack) |
| SF4-SF7, SM4-SM7 (street, hip-hop, casual, skate) | Hoodies, puffers, varsity jacket, tracksuit, cargo pants, jerseys, tank, baggy jeans (as jeans), bucket hat, durag, bandana, beanie, snapback, slides and socks, high-tops, belt bag, backpack, skate helmet | Headphones, Sweatbands | Crew and tube socks (needs a socks slot), knee and elbow pads, a wallet chain, dungarees with one strap down, a colour-block windbreaker (a piece has one colour and a trim) |
| SF8, SM8 (beach) | Swimsuit, bikini, swim trunks, sarong, wetsuit, sun hat, flip-flops, slides, visor, lifeguard whistle, rescue tube, swim goggles | Rash guard, Towel wrap | A towel over the shoulder, a crochet cover-up (sheer), a thong back (drawn as a brief), a surfboard to carry (the game's surfboard is a thing you own, not a bag) |
| SF9, SM9 (lounge) | Pajamas, bathrobe, slippers, fur slippers, joggers, tank, shorts | Onesie (a hooded one-piece; no ears or tail), Towel wrap, Silk slip (underwear) | Sleep mask, a towel round the waist as clothes (the bathhouses have one), bunny slippers |
| SF10, SM10 (night out) | Mini and slip dresses, corset top, leather pants, fur coat, mesh top, blazer, platform boots, heels, chains, choker, clutch, shield shades | Sequin dress (gold with pale specks), Glow bracelets | A cut-out dress, a sequin bomber, a star-mesh top |
| SF11-SF12, SM11-SM12 (punk, goth) | Leather jacket, studded vest, plaid skirt, ripped jeans, combat and platform boots, spiked collar, choker, mohawk, fishnet as a mesh top, long coat, corset | Biker gloves, Kilt | Bondage straps, safety pins, fishnet tights, arm warmers, a hooded cloak, a parasol, cyber-goth dreads |
| SF13, SM13 (sport) | Sports bra, leggings, shorts, tracksuit, jerseys, tennis dress and skirt, cycling jersey and shorts, bike helmet, headband, visor, running shoes, duffel | Sweatbands | Boxing wraps and gloves, a yoga mat, a basketball (props) |
| SF14, SM14 (decades) | Flares, fringe jacket, round tinted glasses, jumpsuit, bodysuit, blazer, shell suit as a tracksuit, slip dress, plaid skirt, overalls, aviators, mullet, afro | Pompadour (hair), Sweatbands | Leg warmers, a cassette player, butterfly clips |
| SF15, SM15 (western) | Cowboy hat and boots, flannel, fringe jacket, overalls, puffer vest, trucker cap, waistcoat, trench (as a duster), work gloves | Neckerchief, Bolo tie, Leather chaps | A belt buckle of its own (the pass draws a tucked shirt's buckle), a concho belt, a prairie dress's tiers |
| SF16, SM16 (outdoors) | Puffer and field vests, rain jacket, cargo pants, hiking boots, hiking and trekking packs, chest waders, ranger hat, beanie, flannel, climbing helmet, chest rig | Camo jacket, Camo cap | A climbing harness and chalk bag, trekking poles |
| SF17, SM17 (formal) | Evening gown, wedding dress and veil, tuxedo, suit, bow tie, top hat, tiara, pearl necklace, clutch, dress gloves (issued) | Evening gloves, Sherwani, Kilt, Sequin dress | A sari, morning dress with tails, a mermaid gown's train, a bouquet, a boutonniere, a sporran |
| SF18, SM18 (winter) | Puffer, wool coat, rain jacket, ski suit, ski goggles, pom-pom beanie, earmuffs, winter and rain boots, turtleneck, sweater, flat cap | Scarf | A fur hood's trim, mittens (gloves stand in) |
| SF19, SM19 (festival) | Flower crown, kimono, poncho, fringe jacket, tie-dye (a pattern), crop top, denim shorts, wellies, round shades, beaded bracelet, mesh top, belt bag | Glow bracelets | Glow sticks in the hand, harem trousers, a crochet vest |
| SF20, SM20 (preppy) | Polo, tennis skirt and dress, sweater, chinos, boat shoes, loafers, blazer, plaid skirt, puffer vest, visor, pearl necklace, headband, rugby shirt | Sweater vest | A sweater tied over the shoulders, jodhpurs and a riding helmet, a golf glove, seersucker |
| SF21, SM21 (work) | Scrubs, stethoscope, chef whites and hat, apron, hard hat, hi-vis vest, coveralls, delivery pack, uniform shirt, ranger hat, lab coat, tool bag, work boots and gloves | Paramedic uniform, Hi-vis coverall, Security shirt, Lanyard | A tool belt, a clipboard, knee pads |
| SF22, SM22 (disguise) | Balaclava, ski mask, gaiter, medical mask, face bandana, pig mask, fedora and trench, coveralls, duffel, gloves, cap | Bear mask, Panda mask (both the pig mask's shape, recoloured), Biker gloves | A chicken mask, a wig, novelty glasses with a nose, a parcel to carry |
| SF23-A..G, SM23 (underwear) | One "Underwear" set | The slot and its 17 pieces (above) | Socks, knee socks, tights and fishnets (a socks slot); a thong (drawn as a brief: a figure's back is 3 art pixels wide there) |

## Checked, and how

- **Every pose, eight facings, pass on** (`pass2/anim-*.png`): I looked closely at sheets 1-3 (standing, the four
  gaits, punch, swing, aim, carry, hands up, fish, kneel, roll, down, dead, swim, ride, pedal, sit, drive, held, sitting
  low, cuffed, stagger, limp, crawl, the downs and deads, chop): all whole, limbs attached, held things in the hand.
  Sheets 4-7 (the motorbike tuck, saddle, skate and surf tricks, dances, push-ups, carts, the statue, escorts, bars)
  were rendered and are covered by the test that every pose draws whole, but I did not study them frame by frame.
  Nothing needed fixing in what I looked at.
- **The walk's bob:** already there - the head rides one art pixel up and down through the stride (25 / 26 / 26 / 25 /
  26 / 26 art px tall over six frames). Left as it is.
- **Not seen running in a browser** (as pass 1). Before approving, with the pass on, look at: name tags (I moved the
  bubbles and the marks; I could not confirm where the name itself sits against the taller head), people in cars' seats
  and on bikes, horses, boats and kayaks (the poses draw; their fit to the vehicle's art shows only in the game), the
  creator's stage and the title portrait, and the new Settings switch.
- **Tests:** `test/characters2.test.js` (10), with `peoplepolish*.test.js`, `look`, `peoplelook`, `outfits`,
  `wardrobe`, `starter`, `npcpeople`, `bathhouse*`, `guide`: all pass. `test/perf.test.js` cannot run on this Windows
  checkout (four of its six tests fail the same way on the commit before pass 2: paths and the stamp); sizes were
  measured by hand with LF endings. Not stamped: stamp on merge.

## What's left

- The 36 older hairstyles were not reshaped - pass 2 added six, it did not redraw the rest.
- Faces are pass 1's. The concepts draw no mouth (see the owner's choices).
- Socks (a slot), knee and elbow pads, a wallet chain, a tool belt; phone poses (text, call, selfie, a texting walk);
  prosthetic limbs, vitiligo and body freckles; the draped pieces in the table's last column.
- The dark-cloth lift is tuned on sheets, not in the game's lighting: at night the game multiplies everything down, and
  the grounds sheet's night rows are only a tint.
- Two of the animal masks are the pig mask recoloured - they read as "an animal head", not as a bear or a panda.

## The owner's choices

1. **The renderer's code budget, 411 -> 414 KB** (`tools/perf.mjs`; it measures 413.4). The catalogue is read by every
   player's renderer, so the 51 new catalogue lines cost 2 KB there whatever is done with the drawing. To stay at 411,
   about 30 of the 45 new pieces would have to go. I raised it and said why in the DEVLOG - yours to confirm or undo.
2. **Nothing on, anywhere, in a game for 13 and up.** Built as decided. Two things to weigh: the Terms list the content
   plainly (crime, shooting, cartoon blood, chases, chat) and say nothing of censored nudity; and *Censored nudity* is
   off by default. On by default is one word in `client/input.js`.
3. **Lingerie is sold, the basics are free.** The seven basics are in the starter wardrobe; the other nine cost
   30-95 at Velvet & Vine, Afterglow, the department store, the sports and outdoor stores. Say if all underwear should
   be free.
4. **Police patrol shirts light blue?** The concepts' clearest police read (CC5-B, SF21, SM21) is a light-blue shirt
   over navy trousers. Today only rookies wear it; everyone else is navy on navy. One word in `shared/look.js` `policeLook`.
5. **Drop the mouth?** The concepts' small figures have eyes and a brow and no mouth. Pass 1's mouth is two faint pixels.
6. **Approve by sheet:** dark clothing and uniforms (`vs-SM12`, `vs-SF12`, `vs-C3`, `grounds`) could go live apart from
   the proportions if you prefer to stage it.
