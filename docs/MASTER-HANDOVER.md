# City Life Auto - master handover

**Every new chat reads this first.** The owner works in one chat per phase - pre-beta, beta, launch (11-22 02:48) -
and talks about every part of the game in it; a phase chat is restarted from this file when it grows slow. This file is
what connects them: where the truth is written down, how the owner wants work done, what state the project is in, and
what each chat must do before it ends. It is kept short on purpose; it points at the documents that hold the detail.

Last updated: 2026-11-26 13:20 (the Fable 5.2 art chat, still open: section 6's first block - the night of 11-25 and part B's first rows on the morning of 11-26 -, package 6's state). Update the "Where things stand" and "Work packages" sections
at the end of every chat.

## 1. How a chat starts
1. Read this file, then `CLAUDE.md` and `docs/DECISIONS.md` (the rules say so too), then the handover for the package
   you are picking up (section 5).
2. Catch up by package, not on everything (the owner, 11-22 02:33; reading all 45 project docs and 460 concept
   pictures at the start of every chat would spend his usage on things the package never touches):
   - Know what exists: read the titles of the project's doc list and the index of the concepts
     (`claude/world-concepts-catalogue.md`, `claude/concepts-crossref-midtown-and-shared.md`).
   - Read in full: the package's "Read first" documents (section 5).
   - Look at, as pictures: the approved style targets (`docs/art-v2/targets/`) in any chat that draws or places art;
     and, before touching a place, every concept the catalogue lists for it. Say in the first report which concepts
     were looked at. A place with no concept: say so before building it.
3. Read the owner's opening message. It names the package. If he brings notes for other areas, log them (section 4);
   don't act on them in this chat unless he says so.
4. Before planning anything, check the waiting branches for work that already covers it (`git branch -r`,
   `claude/branch-map-2026-11-21.md`). Doubling up and overwriting are the two things he has asked to be protected from.

## 2. Where the truth lives
Nothing important should exist only in a chat. If it was decided or noticed, it is in one of these:

| What | Where |
|---|---|
| Every owner decision, by area (product, HUD, art, music, world, police, vehicles, economy, FTUE, process) | `docs/DECISIONS.md` in the repo. Read before any task; a new decision goes in the same commit. |
| What was built, why, and what it cost | `docs/DEVLOG.md` (one entry per feature) |
| Working rules for the code | `CLAUDE.md` (loaded automatically) |
| The game's design | project doc `claude/game-design-document.md` |
| Art direction and the style anchor | `docs/art-v2/SPEC.md`, the approved targets in `docs/art-v2/targets/`, project docs `claude/art-v2-plan.md`, `claude/art-process-2026-10-26.md` |
| Everything open before the beta | project doc `claude/prebeta-list.md` (also `docs/audit/PREBETA-LIST.md`), the audit reports in `docs/audit/` |
| After-launch fixes and ideas | project doc `claude/postlaunch-fixes.md`; DECISIONS "Future features" |
| Music | project doc `claude/music-briefs.md`; DECISIONS "Music and sound" |
| Launch, marketing, monetization | project docs `claude/launch-plan-*.md`, `claude/marketing-plan-*.md`, `claude/monetization-plan-*.md` |
| The state of the art passes | project doc `claude/nature-status-2026-11-21.md` |
| The pre-beta merge | `docs/tasks/PREBETA-HANDOVER.md` (project copy: `claude/prebeta-handover-2026-11-21.md`) |

If two of these disagree, `docs/DECISIONS.md` wins, and the newer dated line wins inside it. Fix the other one.

## 3. How the owner wants work done (the ones that have cost time when missed)
- **Merging to `main`** (11-22 13:12): Claude merges its own pull requests when their tests pass and tells him after
  in a line (`gh api -X PUT repos/dead-baron/city-life-auto/pulls/<n>/merge` - a plain push to `main` stays refused by
  the session's guard). Still his word first: the world batch, anything touching saved progress, prices, accounts,
  privacy, payments or legal text, a raised performance budget, launching the beta. DECISIONS, Process.
- **Every fix is a class fix:** fixed everywhere it occurs, with a test or lint row over the whole world so it can't
  come back. A note fixed in one spot is not done. Every note gets a check, or is marked "eyes only".
- **Check before eyes:** look at the result yourself (render it, beside its concept and its surroundings) before
  showing him. For terrain: no straight ruled line, stone that matches what is round it, and it must make sense with
  the ground level that is really there. Never a line of cliff pieces on flat ground.
- **The ripple check:** a note about one thing is a note about its class. Before fixing, widen it - the same thing
  elsewhere (the other hospitals), the same kind (other buildings with that fault), the same cause (the shared rule or
  code, and how players use the place) - and count each from the world's data and the code, not from renders. Tell him
  the counts in one line, and what is fixed now against logged for later. He does not want to call out each case.
- **Variants only where they earn it** (11-22; narrows the 11-12 rule): 2-3 side by side only for a new look that sets
  a direction and is costly to reverse (logo, HUD style, a new art style). Otherwise pick, build, and say the pick and
  why in one line; he redirects if he wants. A ruling given once is applied everywhere without asking again. Count the
  places a pick touches first: many or hard to undo, show him; few, pick. Good alternatives go into the world as
  variety, not in the bin.
- **Pictures:** reports short; 2-3 small pictures. Show what the check-before-eyes render already produced; don't
  render only to show.
- **Colors and style are set game-wide** by the style anchor, never per sheet. One outline rule.
- **Batch:** world changes into one rebuild; art changes into one re-bake (about five hours on the server); server
  changes together.
- **Finish or hide:** what isn't finished for the beta is switched off for it. His call per item.
- **Say plainly what is untested, unverified or a placeholder.** He would rather hear it than find it.
- **Usage is limited.** One chat per package; end a chat at a commit; batch his notes; heavy commands one at a time
  (`flock /tmp/cla-heavy.lock`, Node heap 3072 MB); at most three agents.
- Privacy and safety rules: his email is identity only; never ask for secrets in chat; no IPs, emails or account ids
  on any dashboard; nothing about his son saved anywhere.

## 4. Notes that arrive mid-chat
- He talks about any area in the phase chat (UI, music, art, design, bugs, ideas): that is how he likes to work, and
  it is fine. What keeps it safe is that the work itself still goes one package at a time.
- About the package in hand: act on it.
- About anything else (a UI note during world work, a gameplay idea, a bug seen in passing): **log it, don't act**
  until its turn, unless he says to do it now.
  Add it to `claude/prebeta-list.md` (before the beta) or `claude/postlaunch-fixes.md` / DECISIONS "Future features"
  (after), with the date and his words, and tell him in one line where it went.
- **A picture he attaches** (11-22 02:33): judge what it is. A screenshot pointing at a fault is feedback - log the
  note in words, don't keep the file. A concept or a reference for how something should look is kept: commit it under
  `docs/art-v2/` (the folder for its subject), add a line to the concepts catalogue saying which place or thing it
  is for, and tell him in one line that it was saved and where. Unsure which: ask him in one line. Never keep one
  silently, never drop a reference silently.
- A decision ("let's do X", "I prefer B") goes into `docs/DECISIONS.md` with the date and his words, in the same
  commit as the work it governs, whichever package it belongs to.

## 5. Work packages (the order of work inside the phase chat; one at a time)
Restart the phase chat from this file at a go-live, or once it has been collapsed twice, or when replies slow down:
he says "make the handover", the chat does section 7, and he opens a new one.

| # | Package | Starts from | Read first | State |
|---|---|---|---|---|
| 1 | Merge and go-live of the finished art and UI | `main` | `docs/tasks/PREBETA-HANDOVER.md` | **Done 11-22:** PR #1 merged (the art re-bakes once, ~5 h), PR #2 the new people on for everyone (the old kept on branch `people-before-polish`). Claude now merges its own PRs when tests pass (DECISIONS, Process, 11-22 13:12); the world batch and the beta launch still need his word. |
| 2 | The world batch (the audit's placement fixes, `egret`, the nature pass's solid pieces, the 11-22 rows) | branch **`prebeta-world2`** (main and `nature-world` merged in, 11-22 night) | `docs/audit/REPORT.md`, `docs/audit/PREBETA-LIST.md` (A and the 11-22 section), the DEVLOG's "World batch" entries on that branch | **Live 11-23 (PR #25, the re-bake following):** egret; walkways clear of plants (plantOnWalk 2,914 -> 0, planterOnWalk 422 -> 0, plantOnPath -> 0); bin bags by a bin (44 -> 0); door paths round to the pavement (doorOnGrass 372 -> 89); every boat drivable (deadBoat 103 -> 3: beached canoes left as a detail); railings on the shore (railOverWater 110 -> 0); no parking space on a pavement (parked 124 -> 0); farms back from the beach (cropInTown 49 -> 0); shop signs name what's behind them (frontNames 7 -> 0); no curtain of hanging lights (festoonDensity 9 -> 0); hospital helipads on open ground (heliOffPad 10 -> 1); the arrival tunnels go into a hill (portalOnFlat 16 -> 0); pier roots on dry land (beachWater 4 -> 0); fountains and groves in the big empty plazas (bigEmptyPlaza 14 -> 0); walk-ins beside a counter at the wall get rooms (wallOnly 17 -> 12); the sea cave's rock hill (`nature-world`). Found and fixed by the whole suite on the branch: the Red Rock trailhead's 4x4s and the MX pits' trucks parked again (gravel holds a car; `parkcheck.js` parkExempt - one answer for build, lint, server: the server had never parked either, on main too), a shrunk field squared at the valley's edge, no fountain on the Waves Arena's pitch, no tree crown over a door or sign (10 -> 0), the boats' tests. Lint 42/42; the whole suite run on the branch (`docs/tasks/PREBETA-TESTS.txt`, its last section: every failure looked at); before / after pictures looked at (`tools/regress/`: the expected changes only - boats now the server's, trees drawn as other kinds as the prop list moved, one fix: the tunnel hill's shading made smaller). Going live re-bakes the art (~5 h; identical chunks carry over). **Left, why:** northDoor 19 (the Strip's and Old Downtown's casino blocks want re-planning - his call); rampCrossesRoad 9 (freeway ramps re-routed: road-network work, a pass of its own); wallOnly 12 (too small for a room, or hand-built - Greenfield Park's Lane Mart and Park West Coffee need a room laid late, with the café's tables: his say first, the arrival's first scene); doorOnGrass 89. **For Fable (art):** lobbyDoor 161 (done 11-26 on `fable-art-1124`: 0), signCovered 158 (11-26: 68), atmStray 52 (a booth - decided 16:45) and N18 (an ATM under an awning: awnings are picked by the art), N23 (roof billboards cut off: `client/art2/game/statics.js` billboardOnRoof - the board's lower half behind a roof drawn in front), dockOverlap 5 (the marsh boardwalk's bends want a landing piece), interiorOverlap 25 (inside a walk-in, a taller building south of it is drawn up over the room - the page should fade or cut that front while you're in), railOverWaterArt 18 (rail bridges). **Asked 16:48, open:** more bin bags outside the bins in the rough districts? |
| 3 | Systems and UI fixes, by area (NPCs, vehicles, minigames, menus) | `main` | `docs/audit/PREBETA-LIST.md` sections C-D and the 11-22 section, `docs/audit/REPORT2.md` | Batch 1 live (PR #1); N7 the quick bar live (PR #5: a strip over the weapon plate on a keyboard; touch and pad keep the wheel). Open: N13 the hospital "robbers" (confirm in play), the gridlock test (a busy four-way: a car waits 37-53 s at the head of a queue, the limit 30 - failing on main; traffic tuning). Done 11-22 night: N14 rooms lit inside at night (PR #11, client only), hudlayout (one note at a time on a small phone on its side) and the prison test (the stash) (PR #12). |
| 4 | Music and the instrument sound pack | `main` | `docs/tasks/MUSIC-HANDOVER.md` (the 11-22 sections), DECISIONS "Music and sound" | **Live 11-22 (PRs #3, #4):** all 56 approved takes as files (loop + full song, Opus + MP3); radios, tapes, car radios stream the full songs, takes rotating 70/30 in sync; shops, lobbies, drive-in, night club, casino, roadhouse loop theirs; each source its speaker sound. The debug menu's *Recorded music* turns them off on one screen. Next: the gigs and the mat to the recordings (charts from the measured beats - N9, N15, N10 tips), the city's neon bars (storefronts with no room: no music yet), the 20 optional takes when he places them. |
| 5 | Checks that stop regressions | `main` after 1 | `tools/regress/README.md` | Half built 11-22: 55 fixed places, shots and a diff (`tools/regress/`); a guard column for the 11-22 notes (their triage table). Still: a guard column for the older notes in the register. |
| 6 | **The Fable 5.2 art pass (in hand, 11-24)** - in the order of 11-21 08:05, confirmed 11-24 09:39 (DECISIONS, Art direction): **A. nature finished first** (water at sunset, night and in rain and the open water notes; then the biomes - forest and meadow, redwood, mountain, desert, coast and jungle, the water's edges - each place beside its concepts); **B. buildings and districts, one concept-led pass a district at a time** (the shared kit of fronts, signs, roofs and landmarks; the cinema redesigned - lobby + separate auditoriums, before the beta; then the craft pass's waves, `claude/world-craft-pass-2026-11-14.md`); **C.** the people's faces (painted lips drawn the same in every frame, stray pixels), the UI's style pass and clothing pictures for the Inventory, the art the finish-or-hide items wait on (car soccer's arena, the races' markers and grid, tennis's swing), the smash art, the playing animations on the beat (N15), vehicles last; then the cinematics reshot. The 11-22 and 11-23 notes are folded into the place they belong to, never a pass of their own. | `main` (branch `fable-art-1124`) | **`claude/art-pass-plan-2026-11-24.md`** (the order, the concept families per part, the rules carried), `claude/nature-status-2026-11-21.md` and the other four nature documents of 11-21, `claude/world-craft-pass-2026-11-14.md`, `claude/concept-audit-2026-11-03.md`, `docs/tasks/PREBETA-NOTES-2026-11-23.md` section 3, `docs/audit/PREBETA-LIST.md` ("Art on Fable", the 11-24 sections), the style targets in `docs/art-v2/targets/` | **In hand (11-25 16:45; the desert begun - section 6), all on branch `fable-art-1124`, nothing of it live but PRs #48 and #49:** water done; forest and meadow; the redwood overhaul part-way (rooms, footbridges, the fern kit planted, the giants' tops a mix of three, **the creek network**); nature redrawn without the painted shadow (`claude/nature-redraw-2026-11-25.md`); the mountains' crags in look B, **the summits built as knobs, the high mountains shaded** (`claude/mountain-look-2026-11-25.md`). **His word 11-25 09:30: re-bake after the summits and the creeks - both are in; the gate (whole suite, a running-game look) then the merge.** **11-26 04:50:** part A is done but its leftovers (the mission ruin's size, farm yards, summit switchbacks - ART-CHECK-LIST); of B the cinema is rebuilt and the shared kit audited (`docs/tasks/SHARED-KIT-AUDIT-2026-11-26.md`); of C the lips' fix and the Inventory's clothing pictures are in, the UI's look and a soft lip colour wait on his pick. The whole suite has run (`docs/tasks/ARTPASS-TESTS-2026-11-26.txt`); the running-game look and his word for the merge are what is left of the gate. The list for his eye: `claude/art-check-list.md`. Section 6 has the detail. |
| 7 | Launch steps | `main` | `docs/audit/PREBETA-LIST.md` section H, `claude/launch-plan-2026-11-03.md` | On his word "launch the beta". |

Chats that can run side by side: 4 with any other; nothing else safely.

## 6. Where things stand (2026-11-24, 09:00 PST - the Opus part of the pre-beta is done)
**The art pass, 2026-11-25 16:40 PST (the Fable 5.2 chat; branch `fable-art-1124`, pushed; the DEVLOG's 11-24 and 11-25
entries have each piece):**
- **Live:** PR #48 (11-25 01:35, his word) - the buildings over your street, sidewalk or alley go see-through; PR #49
  (09:10, his word) - they fade all but clear, and emotes run through their frames.
- **On the branch, baked - goes out with ONE re-bake (~5 h) on his word:** the water pass; fields' edges, found places,
  trails; redwood rooms, footbridges, Fernwater Creek (a sample: he said "I believe so" to a network, wants to look at
  `report-39` first), wild banks, Mirage Lake's shore; **nature redrawn at the source** (palette.js `natRamp`,
  flora.js `LEAF_PAINT`, ground.js `NP`: 114 of 129 plant kinds, rocks, the forest floor - his word of 11-25 03:29:
  redraw, do not correct afterwards); the fern kit planted (`fernKind`), wild spike flowers leaning, the giants'
  tops a mix of three, a stick bridge; a fork's centre lines; the El and highway decks fade from the ground; bridges
  on piers; no painted white at the sea's edge.
- **On the branch, page code - no re-bake, live on his word:** the shark's bite redrawn; the shark reshaped; the
  cats (the face as before, a one-pixel nose - light pink, the black cat's black -, thin long tails; his words of
  15:26-16:18 in DECISIONS); cloud shadows by day with a debug switch. As a PR from a branch off `main` with only
  those files (`client/art2/animals.js`, `lightgame.js`, `engine.js`, `devcats.js`, `devmenu.js`); the
  art hash does not move with them (checked: the same from c08e750 to 4a41a9a - `animals.js` counts in the bake's
  code size only).
- **The desert, begun 11-25 16:30 (baked, with the re-bake):** bloom a rare patch, reeds out of the ghost town's
  street, a desert river's strip in rushes, a seep's ring and cracked earth as dry mud (`test/desertflora.test.js`).
  **Decided 17:18:** the tables' cliff faces stay A, stepped (B, one wall, not built). 17:10: 28 found places by rule in the desert (playa, hoodoos, saguaros, joshua trees -
  `report-66`; a world change). 17:30: the hoodoo drawn as a banded column under a cap (12 places), the desert's arch red
  sandstone. 18:10: the tin shack and rusted pickup, a fifth found place (30 in the desert).
  Left: the mission ruin's size (a step of its own), a seep's square pool (with the water's edges). **18:14, his
  note:** the hoodoos looked unnatural - redrawn as weathered rock, mixed sizes (DECISIONS: the rule for every rock
  formation drawn by code).
- **The coast and jungle, begun 11-25 18:00 (baked, with the re-bake):** a tideline of wrack on wild sea beaches,
  shells thinned, tide-pool shelves in dark basalt, no reeds on the sea's shingle (`test/coastart.test.js`). Left
  (ART-CHECK-LIST): the bluffs at North Cape and the Egret coves (square wall pieces), cypress knees, the
  fishing rocks' gear. 19:35: the sea stacks re-sited by rule (no three in a line, mixed sizes, twelve shapes) and
  the sea cave's rock a headland of crags (`report-72`). 20:30: North Cape's bluff a scarp of basalt, the Egret
  coves' horns rough headlands, knees along the marsh's edge (`report-73`). Left on the coast: Coral Cay's pool
  and stream above the falls (not built: the spine above the falls is tall rock, water there would be hidden).
  **Overnight 11-25 to 11-26 (his word 20:54: "keep on moving through as much art polish as we can tonight ... I
  will check in in about 8 hours"; read as: art goes on, nothing to `main` without his word):** a fall lands in
  water (`fallsFeet3`, `report-75`); boulders and outcrops under his rock rule, a desert pool's lobed rim, riffles
  broken (`report-76`); 215 fallen logs in the woods by rule, hollow giants and root caves in the redwoods
  (`report-77`); **the cinema rebuilt** - a compact inside at the door, four screens (`report-78`). Not built, his
  call (ART-CHECK-LIST): the mission ruin bigger (its voxel model's memory), The Palace as a second cinema.
  From 23:20 the whole suite runs on commit 033be77 in a separate copy (`/tmp/wt-before`, results
  `/tmp/ww/suite-results.txt`, about five hours); while it runs only page-side art is worked on, so that commit is
  what the re-bake would take. After it, page-side only: painted lips hold their place over a walk (`report-79`;
  found for his eye: the eyes' own spacing varies a pixel); **clothing pictures on the Inventory's tiles** (part C3,
  `client/piecepic.js`, `report-80`, `report-81-all-pieces`; 334 of 390 pieces) - both touch `people.js`, which is in
  the art hash, so they ride with the re-bake; their own tests pass, the suite's run does not cover them.
  **Three picks wait on him, nothing changed in the game for any:** the UI's look - A today, B hard pixel frames,
  C hard frames and pixel icons (`report-82` to `84`; `tools/uistyle/`, `tools/uishots.py` `UISHOT_JS`); a soft lip
  colour A-D (`report-85`, `tools/lipsheet.mjs`); the eyes' spacing over a walk. **Part B step 1 is written:**
  `docs/tasks/SHARED-KIT-AUDIT-2026-11-26.md` - what of the shared kit is built (signs by trade, banks' porticos,
  interiors), what is there and not measured (roofs, murals, paving, window goods), what is not (picture signs,
  night signs, lit rooms, the lint's `signCovered` 157) and a proposed order. **Its first row is done (11-26 morning):**
  a flat over a shop has its own door - 391 fronts, `lobbyDoor` 161 -> 0 (`shared/world3-flatdoors.js`, `report-86`).
  Then `signCovered` 157 -> 68: a hotel's entrance canopy is cloth with its name on the front edge (it was the
  forecourt's white slab over the name, 50 places), a moved sign is not painted behind, cones stand out from the
  boards (`report-87`; the 68 left are listed in the DEVLOG). Then N23: a sign on a roof is seen whole or is not
  there (`clearRoofSigns`, the lint's `roofSignCut` 28 -> 0).
  **His words of 11-26 09:00 (DECISIONS):** the merge and re-bake WAIT for more of the city; **the UI's look is C**
  (hard pixel frames and pixel icons - to build into every screen with a lint; not started); lips stay A; the
  canopies a mix - a named hotel's name on its canopy, an OFFICE or a plain HOTEL on the wall over a low plain one
  (`report-88`). **11-26 midday: the UI's look C is built** (page code, commit "The UI's look C": `style.css` tokens
  and notches, pixel icons for all 160 glyphs in the menus, the lint in `test/uitokens.test.js`, `report-89` to `91`;
  the buttons over the street have the pixel icons too - his word of 11:00). **Look C goes live with the art batch**
  (his word, 11:00): no PR of its own. **Picture signs built** (his pick of 11:02: A and B together, some shops -
  234 hanging signs, 21 pictures; `report-92` the pick, `report-93` built). Next in the city: window goods for the
  seven trades without them, roofs (count first), night signs and lit rooms (variants for his pick first). A process left
  running does not live past the end of a turn here: the suite only moves while a turn is open (found 00:37).
  **The suite finished 04:27** (`docs/tasks/ARTPASS-TESTS-2026-11-26.txt`): 452 of 460 files clean. Two failures
  were the night's own and are fixed on the head (the hollow giants painted near black - `leaflight`; LIVE blades on
  playhouses - the lint's `bladeBiz`); `firefighter` passes alone; `gridlock`, `scenes` 8, `world3mesa`,
  `world3wild` and `visaudit` fail on main too - but `visaudit` has ONE DOOR MORE hidden under a tree than main's
  record (4 against 3; which is new is not determined). Main (PR #49) is merged into the branch, every conflict to
  the branch's side. **What is left of the gate:** a look in a running World v3 game; then his word, the PR, the
  re-bake (~5 h). The bake's code: 1,106 of 1,150 KB. **The bake's code budget is 1,150 KB** (his word of 16:51; at 1,098.1).
- **Decided 11-25 07:19:** the mountains' crags are look B, no snow drawn (in).
- **Decided 11-25 09:03:** build the summits as knobs from the plan; lay the creek network ("Creek looks good let's go
  with it"); the El's and the decks' see-through OFF for now (`DECK_SEE` false); **PR #49 live** - faded buildings all
  but clear, emotes run through their frames.
- **Decided 11-25 09:30:** "Let's rebake after the summits and Creek work" - both are now on the branch (below): the
  branch goes to `main` in ONE re-bake (~5 h) once the gate is clean - the whole suite (never run on this branch:
  456 files, 54 of them a World v3 build of ~5 min each, one at a time) and a look in a running World v3 game.
- **Built 11-25 09:30-12:00 (his words of 09:03), on the branch, baked:** the summits as knobs of rock (Eagle Knob 358 m
  with the telescope and the Summit Trail, Windy Col 340 m, Cairn Peak on its spur at 106 m: a shelf, solid rock round
  it, two crag walls and stone steps in a cleft between them; the walked granite ground); **the relief layer's bytes
  reach the mountains' top** (mapcore.js `RELIEF`: 23.2% of Granite Peaks read 255 - flat, unshaded; now shaded and
  ledged, a look he first sees in `report-49`); the hill's darkest shade 0.64 (was 0.55); **the creek network** (8
  creeks, 1,418 tiles, 36 pools, 3 ponds; no creek meets a road, so the culvert rule is laid but unseen). Pictures
  sent: `report-46` to `report-49`.
- **11-25 11:57, his word on `report-46` to `-49`: "This looks good lets keep moving forward."** The gate and the
  re-bake: art while he is here, the gate when he stops for the day (Claude's answer to his question; no merge
  before his word on that). **12:45:** faces and lips - look only, do not over-polish (DECISIONS).
- **Built 11-25 12:00-13:40, on the branch, baked:** the mountains' streams (`CREEKS3.alp`: six, one under a road in
  a culvert with stone headwalls - `report-50`); for both creek networks a pond only where there is room, a creek
  runs on into water within 12 tiles. Next in the mountains' water: Summit Tarn's outflow as a cascade down the rock
  band, falls over cliff bands, Summit Tarn in a cirque (show him first). 
- **11-25 13:33-15:30, his notes on the streams (DECISIONS):** a stream runs on into the water it reaches (`reach` 16
  tiles); a road over a creek is a bridge - deck tiles, a rail on each edge joined to the street, no headwalls
  (`report-51`; 14:52: "looks good how it is now" with longer rails); Summit Tarn may be changed - a cirque of rock
  behind its north shore and a lower pool where its outflow ended (world3-tarn.js `TARN3.cirque`); the outflow's
  cascade down the rock band was tried five ways and is off (`CREEKS3.alp.tarnOn`). Logged for their turn
  (PREBETA-LIST, 11-25 13:33): train riders swimming, the train's front above ground past a tunnel mouth, tunnel
  mouths that do not line up.
- **15:10, his word:** cloud shadows - yes, try it (to build: page code, the light pass); the shark - another pass (to
  do: page code); the cats - asked whether fixed: yes, 11-21, shown again (`report-53`).
- **Waiting on him (11-26 10:40):** (the merge waits for more city art, his word of 09:00; the UI is C; lips A) the
  eyes' spacing; the mission ruin bigger; The Palace as a second cinema; a pool above Coral Cay Falls; the redwoods
  stood apart; the banks; whether the tideline wants to be heavier; the shark, cats and cloud shadows live (page code).
- **Next in the plan:** a look in a running World v3 game, then on his word the PR and the re-bake; part B by
  `docs/tasks/SHARED-KIT-AUDIT-2026-11-26.md`'s order (the lint's open rows first), then the districts' waves; part
  C after his picks; vehicles; the cinematics reshot. Not done from the summit plan: switchbacks, the bench turned
  to the view. Not done in nature: the farm yards, Summit Tarn's cascade.
- **Tools made:** `tools/nature/darkscan.mjs` (the near-black census over the baked world; `--who`, `--place`, `--prop`,
  `--seabridge`), `tools/nature/paintscan.mjs`, `tools/causeways.mjs`; a running-game picture recipe in
  `tools/nature/README.md` (v3 needs the server started first, ~4 min).
- **Not done / not verified (11-26):** nothing baked on the branch has been seen in a running game; no film watched
  on the cinema's new screens; the clothing pictures' speed on a real phone is not known; the ferries were not
  checked against the sea stacks that moved. (As of 11-25 afternoon, before the suite ran:) Some 300 tests round the changes pass, and a wider batch
  ran 11-25 morning (core, biz, calmstreets, custodyride, contacts2w3, ftue, guide, dmath, mapwindow, firstcar: 108
  pass, 1 fail - calmstreets' Midtown test under load; it passes run alone; world3wayside, world3server, cliffs pass);
  the bake's code stands at 1,098.1 of 1,150 KB; nothing baked was seen in a running
  game; the El's fade only by unit test; PR #48's deploy was never confirmed from the live site.
- **His PDF of play notes (11-25):** `claude/prebeta-notes-2026-11-25.md` - art ones taken in, game-rule ones logged.

**The plan the owner agreed (11-23 15:37):** Opus 5.5 finished everything that isn't art; now a new chat on **Fable 5.2**
does the art pass; then the cinematics are reshot on the final art; then the beta's walkthrough, load test and launch.
**Live on main (PRs #29-#46):** art that vanishes in view; cinematics groundwork; shadows over water; **PR #35, the
batch (05:34 PST)** - P5 building heights (its ~5 h re-bake started then; identical chunks carry over), P6 fences, P7
NPCs unpinned, P9, P10 the hoop marker, P11, P12, aim on right click, the flash at the barrel, the "!", vehicles smash
fences/benches/shelters (sitters thrown), P2 (the way ahead first at speed; less garbage per frame), P8 (routes from the
street you're on, the police ride, racers off the median), the UI pass (tools/uishots.py) and its fixes, the stash side
by side (UIC-21), My looks, headlights' share of the lights; **#45** the page's code budget 540 -> 560 KB (the owner's
call); **#46** the kayak races hidden, the other road in the daily goals, "bank it" on the first knock-down.
**Not looked at in a running game on a device** (the owner to try - the list in the 11-24 chat): smashing, aim and
flash, the hoop marker, the Pixel at speed, the police ride, the stash on a big screen, My looks, P5's streets once the
re-bake is done.
**Left for later (non-art, not blocking the art pass):** P2's biggest garbage is page code (main.js collectLights,
weather.js drawRain - the budget has room now); P8's cinematic scripted cars and jams; the UI pass's three findings
(Inventory slots under 44 px on phones, its frame empty a moment on first open, the pause menu's second column in a
narrow desktop window); PREBETA-LIST C's other items; the walkthrough (G).
**Now: the Fable 5.2 chat** - package 6 above, nature first (the owner, 11-24 09:25: "We were working on the nature pass first
... make sure that gets prioritized"). The cinema's redesign is in its part B (world + art; the owner wants it before the beta). Then the cinematics (PREBETA-NOTES-2026-11-23 section 2: reshoot, wildlife first, new behaviour scenes) and
C4's variants.

**Live today (main, PRs #17-#32):** the quick bar a keyboard's only; the ellipsis and touch ammo; the Inventory (character,
clothes, underwear and socks, towels, REMOVE ALL); the stash in the Inventory (home, gun/pawn counters, hideout); press and
drag on every device; the trunk (its own slots, spills when wrecked); tile and slot polish; walk-ins dissolve (no screen
dip); the world batch (#25, its re-bake running); the triage of the 11-23 PDF; chunks never evicted in view; cinematics'
clean start, quiet page and Keep/Cut/Bug marks; no long shadows on water; the review list's check-off.
**Decisions of 11-23** (in docs/DECISIONS.md): rooms for Lane Mart and Park West Coffee; a few bags by bins in rough
districts; casinos kept, doors made to read; the stash holds items and weapons (clothes stay in the wardrobe); the trunk
its own storage, at risk; cargo crates always visible; REMOVE ALL (not "take it all off") leaves underwear on; underwear
and towels change only at home, a bathhouse or a shower.
**Known failing on main too:** calendar's armored run "leaves from its bank" (date-dependent), gridlock, scenes' live-events check, world3mesa porte-cocheres, world3wild station roads, visaudit's
picnic/cola counts; flaky: burning, happenings, calevents, world3scenes' street race (laneSpot), biz, arrests (hiding in a shop: failed
once under load, passes alone and as a file). Follow-ups: two
north doors at Northshore Beaches under trees.
**Waiting on the owner:** a look at the batch in play; whether clothes should go in the stash after all. (Decided 11-24: finish or hide, the balance proposals, the page budget - DECISIONS.) **Done 11-23 night:** the server's disk
grown to 146 GB (105 GB free) - he did it, Oracle console + growpart.

## 7. How a chat ends (do all of it, in this order)
1. Tests for what changed pass; say which were not run.
2. Stamp, commit, push the feature branch. Nothing left uncommitted.
3. New decisions are in `docs/DECISIONS.md`; a DEVLOG entry for each feature; notes for other areas are logged.
   Then the loose-ends sweep: go back over the owner's messages in this chat and list what he said that is in no
   file yet - a passing remark, a half-idea, the point of a picture, something tried that failed. Log each, or tell
   him it was left out.
4. Update sections 5 and 6 of this file, and the package's own handover.
5. Copy this file to the project (`claude/master-handover.md`) so the next chat sees it wherever it starts.
6. Give the owner the opening message for the next chat, like this:

   > Read `docs/MASTER-HANDOVER.md` on branch `<branch>` (project copy: `claude/master-handover.md`), then
   > `<the package's handover>`. I'm coming from the `<previous package>` chat. This chat is for `<package>`.
   > Start with `<first concrete step>`. Notes I'm bringing: `<his notes, or "none">`.
