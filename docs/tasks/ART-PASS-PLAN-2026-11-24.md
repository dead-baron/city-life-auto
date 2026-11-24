# The Fable 5.2 art pass (work package 6) - the order of work (2026-11-24, agreed)

Project copy: `claude/art-pass-plan-2026-11-24.md`. Branch `fable-art-1124`.

Opened 11-24 09:13 from `docs/MASTER-HANDOVER.md`. The first version led with the newest notes (11-23, 11-24) and put
water, buildings and districts last; the owner corrected it at 09:25 and agreed this order at 09:39 ("I think this
order is looking good let's do it"). The standing order is his of 11-21 08:05 (DECISIONS, Art direction): animals, the
item pictures, **the nature kit, then buildings, storefronts and interiors a district at a time, vehicles last**. The
art pass stopped on 11-21 in the middle of nature ("Please move onto water", 20:11). The newer notes are folded into
the place they belong to; none is a pass of its own.

Nothing here is built yet. The owner's changes to this order go in here.

## The order
### A. Finish the nature pass (where it stopped on 11-21)
Read: `claude/nature-status-2026-11-21.md`, `nature-world-pass-plan`, `nature-audit`, `nature-kit`,
`nature-forest-meadow` (all 11-21), `claude/nature-plan-2026-10-20.md`. The `nature` and `nature-world` branches are
on main (checked: the recorder, the 'va' pieces, fall look 2, the sun-lit plants are all there).
1. **Water.** The recorder was run at midday in clear weather only. Still to do: every kind of water body at sunset,
   night and in rain; the garden pond's white blotches; water creeping beside docks; koi over the water; then
   reflections, ripples and wakes tuned against the concepts. With it, from 11-23: waves forming out of a straight
   hard edge, underwater details with a hard edge near shore, the salmon's leap (tail, splash). His open question:
   whether the calmer sparkle reads flat.
2. **The biomes, in the order approved 11-21 12:12** - pine/oak forest and meadow (started), redwood, mountain,
   desert, coast and jungle, the water's edges. For each: (a) rocks, logs, stumps and props at the game's pixel with
   variety; (b) its hand-made places set beside their concepts and corrected; (c) its missing pieces; (d) small found
   places of the same kit spread by rule through every stretch of the biome. Done so far: (a) for plants everywhere
   and for the wild rocks; (b) one look over eight places a biome; (d) started in the forest only.
   - Forest and meadow: the drawn pieces placed (dry-stone wall, gate, stile, rope swing, stone ruins); a cliff
     overlook; the found places of NS1-B outside Highland Woods; the lawn turf for the art pixel. 11-23: the farm (the
     flower row, hand-crafted fields), sunflowers cut at the top, the off-road trail (a blended start, a real trail).
   - Redwood: still denser than N1; the fern layer over the floor, creek and paths; a walk-in hollow trunk, a root cave.
   - Mountain: the six ledge falls' setting (the river below lower and darker); the redwood horseshoe against NR1-E;
     standing stones that barely read; lichen boulders; the Summit Tarn placeholder (a shelf and a rock face the land
     really has, N5). 11-23: the lake that is a perfect oval; birds flying through rock art.
   - Desert: the mission ruin is small; a cracked playa, the tin shack with a rusted pickup, joshua trees.
   - Coast and jungle: Coral Cay's pool and stream above the falls; kelp wrack and seaweed on the tideline; a rock
     fishing spot; cypress knees in the marsh; the sea cave placeholder (into a cliff or headland the land has, N3,
     N8). 11-23: the sea cave's square rocks, the sea stacks in a line, shells too thick, hammocks too long.
   - The water's edges: rocks, cliffs and banks against E2 and NR1.
   - 11-23, across biomes: the dark outlines on some trees and plants - set to the one outline rule (a dark tone of
     the neighbouring colour, never black), not a new rule.
3. Rocks and the hand-made places' props brought under the variety test (today it covers plants).

### B. Buildings and districts - one concept-led pass, a district at a time
Read: `claude/world-craft-pass-2026-11-14.md` (its checklist is the method), `claude/concept-audit-2026-11-03.md`
(the ranked gaps), the catalogue and the cross-reference, DECISIONS "World and places".
1. **The shared kit first** (it changes every district at once): what the concept audit ranked and has not been built
   as far as the files show - shopfronts by trade and picture signs (gap 4; there is no `picsigns.js`), roofs (gap
   5), landmark exteriors (banks outside, clinics and hospitals: gaps 7, 9 = N20's 31 medical places), night signs
   (14), plazas and paving (15), the MU1 murals. To confirm against the DEVLOG before building. With it the fronts
   and signs the world batch left: lobbyDoor 161, signCovered 158, roof billboards cut off, ATM booths (52) and ATMs
   under awnings, the phone box, lit rooms in windows, a taller neighbour fading while you are in a room (25).
2. **The cinema** (the owner, 11-24: before the beta) - the first place rebuilt in this part. Plan below.
3. **The districts by the craft pass's checklist**: read the district's concepts first and list what each shows that
   the district lacks; carry every past note; no oversized empty space; streets and alleys visible; lights that
   belong to things; props in groups that tell a story; NPC life; checked at noon, sunset and night. Order: the Neon
   Strip's bigger rework (`neon2`; 11-23: the weak block with the lone face sign) and the wave-1 notes of 11-23
   (sidewalk tiles that don't join, the cafe's half neon sign, the brick plazas too busy, the station's "next train"
   sign and platform floor); then waves 2-6 as planned 11-14 - Harbor + Old Town, Westport Center + Old Quarter, Arts
   District; Bayside Heights, Sunset Beach + Pelican Key, Lucky Mesa; Northgate, Civic Center, Southside + Pine Hills;
   the towns and islands; the countryside (lighter). Rail bridges (18) and the boardwalk's bends (5) with their places.

### C. The rest
1. **The people's faces** (the owner, 11-24 09:39). Mouths are as intended: the small faces have none (11-19); the dark
   line he saw was his character's black lipstick. To do: painted lips (lipstick, glam, goth, a clown's) drawn the
   same in every frame and direction (his 11-23 note: in the run cycle it jumps about the face or doesn't draw
   whole); fewer stray pixels on faces; features that read. Read first, so nothing is overwritten: DECISIONS "Art
   direction" (11-19 to 11-21), `docs/tasks/CHARACTERS.md` to `CHARACTERS5.md`, `docs/characters/NOTES.md` and
   `OWNER-NOTES-1120.md`, `claude/characters-overnight-2026-11-21.md`. Method: a check that every face feature holds
   its place over every frame of every cycle, added to `tools/bodycheck.mjs`; each fix measured against a snapshot of
   every figure, the report naming which figures changed (his rule of 11-20 16:51). With it: tennis's racket and
   swing, the playing animations on the beat (N15).
2. **The UI's style pass** (the owner, 11-24 09:39: "Some UI still looks overly polished and not that 16-bit SNES
   style we want (like frames and some text and some icons etc)"). The pre-beta chat's UI pass was about fit: every
   screen at four sizes (`tools/uishots.py`). This one is about look: each screen's shot set beside the UI kit
   (UIK-00) and UIC-01..21, for frames (soft corners, shadows, gradients against hard pixel frames with the gold
   rim), type (anything not CLA Pixel at a whole size), and icons. One sheet for his pick first, because it sets a
   look and DECISIONS 11-06 kept the clean line icons for buttons, apps and the HUD: the same screen with the line
   icons kept, and with pixel icons. Then every screen, with a lint so a soft frame or an off-face font can't come back.
3. **Clothing pictures for the Inventory.** Today every piece shows one line glyph for its slot with a colour dot
   (`client/bag.js` `SLOT_GLYPH`); the concept (UIC-19) shows the piece itself. 390 pieces in 11 slots, 40 colours.
   Proposed: no hand-drawn set - each tile is drawn by the game's own people art (the piece alone, from the front, in
   its own colours, framed for its slot, small pieces enlarged so they read), so a tile always matches what is worn
   and a new piece gets its picture for nothing. Estimate: about a day for the maker and a sheet of all 390, up to a
   day more for the ones that don't read alone (jewelry, glasses, socks). Page-side, no re-bake; the page's code
   budget to watch. The shops' and the wardrobe's rows take the same pictures.
4. The art the finish-or-hide items wait on (car soccer's arena, the races' markers and grid); the smash art; the
   casinos' fancy tier; vehicles last. Then the cinematics reshot.
What stays in the beta only if its art lands (car soccer, the race markers, tennis) is hidden instead if the pass
does not reach it - the owner's finish-or-hide rule.

## Going live
Page-side art goes live as it passes its tests. World and baked art collect into batches - one re-bake (~5 h) each,
on the owner's word: one at the end of nature, then by district wave. Before and after every batch: the 55 fixed
places (`tools/regress/`), the placement lint (its rows at their counts), `test/undergrowth.test.js`,
`tools/bodycheck.mjs`, the visibility audit.

## The concepts, and when each family is opened (about 1,240 pictures)
656 target sheets, 22 UI, 11 alternates, 433 world concepts (WC001-WC433), 95 character sheets, 23 fishing, 5 cart.
- **Nature:** N1-N11 (21 sheets), NK1-A..O, NS1-A..G, NR1-A..E, NA1-A..F, NT1-A..F, SC3-A..H, E1-E3f, W1, W2, WF1,
  WR1-4, Nature-A1..D2, AQ1-AQ6, MX, MI, HU, FA, BE, SR, D13-D16, P3; the world concepts filed under each wild region
  (Highland Woods 27, Granite Peaks 23, Red Rock 18, Willow Valley 19, Egret 12 and the coasts and islands).
- **City, shared kit:** B1-B7, BF1, BF2, R1-A..I, D1-D17, OS1-OS36, RT1-RT11, AL1-A..H, MU1-A..G, S1, S2, P1-P5,
  I1-I7, H1, H2, SI1, SI2, SC2-A..H, SC4-A..I, IN1-IN16, ST1-ST4, HO1-HO6, M1-M5, NP1-NP4, AV1.
- **City, per district:** its own layout concepts WC357-WC433 (every district, town and island has at least one:
  overview, blocks, street level), its entries in WC001-WC356, and its sheets (NE1-NE14 and D8 for the Neon Strip;
  MT, RW, PJ, NB for Midtown; VG for Lucky Mesa; TX, SU, T for stations; and so on).
- **People and UI:** C, CB, CC, CP, SF, SM, NP and the 95 sheets in `docs/characters/concepts`; U1-U18, UIK-00,
  UIC-01..21, IC1-IC5, SI1, SI2.
- **Looked at so far (11-24):** R1-A..D (the style anchor); for the cinema IN14, IN7, BF1, WC222, WC238, WC243,
  WC324, WC325, WC355, WC425; for the UI question UIK-00, UIC-19. Each part's first report names what was opened.

## Rules carried (the ones this pass can break)
- Colours game-wide from the style anchor (R1-D); the greens stay; never re-toned sheet by sheet. One outline rule.
  Plants lit by the game's sun. The small ambient creatures keep their painted look.
- A fall, a cave, a lake's edge is part of the land: never a line of cliff pieces on flat ground. Fall look 2; a
  fall's source is the water above it or a spring. Redwood crowns high over trails, creeks and roads.
- Variety checked by test; nothing grows through a fence; no plant on a walkway, path or road (rows at 0 stay 0).
- No oversized empty plazas; lights belong to things; hanging lights between two anchors with a sag; entrances face
  south; **no big overhangs over entrances** (small awnings stay) - so the cinema's marquee and a hospital's
  entrance canopy (N20) are kept as shallow as an awning, or drawn on the front; to settle with the owner if it reads
  wrong. Streets and alleys never covered (the heights rule of 11-23). Interiors compact, near the entrance.
- One name sign a front; words fit their board; a sign names what is behind it; nothing meant to be seen is hidden.
  No red cross; no real brands, flags or place names; no children, schools or playgrounds.
- People stay chunky on the 2-px grid with the soft outline; bodies by `tools/bodycheck.mjs`; the small faces have no
  mouth; fixes isolated against a snapshot.
- Variants only for a new, hard-to-reverse look; every fix a class fix with a guard; the ripple count first.

## The cinema - what is there, the pick, the ripple
- **Today** (from the code; not yet rendered in this chat): The Grand Theater on Fountain Square is 40 x 59 tiles;
  inside, two screen rooms 5 tiles deep across the back and about 50 rows of lobby.
- **Pick** (from IN14): a compact lobby at the door - ticket desk, concessions, the poster wall, queue ropes, two
  benches; a staff block; a carpeted hall; separate auditoriums off it, each its own dark room with a door, the
  screen on the far wall, raked rows, a lit aisle. Four screens if the room is there (the game has four films); to
  be checked against "interiors compact" and "no huge plain buildings" when it is laid out.
- **Ripple** (from the code): one working cinema; every `theatre`-type building wears a CINEMA blade unless it holds
  a club, and only The Grand Theater has screens. The Grand Theater and The Palace (the concepts' CINEMA) become
  cinemas from one layout; playhouses and the cabaret get a blade that says what they are; a lint row for it.

## Found on the way
- Branch `arenaart` (car soccer's arena art) is not on GitHub and has no DEVLOG entry.
- The project copy of the pre-beta list is behind the repo's `docs/audit/PREBETA-LIST.md`.
- The handover's package 6 row had changed between 11-22 and 11-24 (the newest notes first); put back 11-24 09:45.
- The original chat's last days (11-19 to 11-22) cannot be searched from here: only its October text comes back. The
  comparison was made against what that chat wrote down - DECISIONS, the DEVLOG, the five nature documents.
- Push access: given by the owner 11-24 09:39; `fable-art-1124` pushed.
