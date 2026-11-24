# City Life Auto - master handover

**Every new chat reads this first.** The owner works in one chat per phase - pre-beta, beta, launch (11-22 02:48) -
and talks about every part of the game in it; a phase chat is restarted from this file when it grows slow. This file is
what connects them: where the truth is written down, how the owner wants work done, what state the project is in, and
what each chat must do before it ends. It is kept short on purpose; it points at the documents that hold the detail.

Last updated: 2026-11-23 evening (the pre-beta chat, Opus 5.5). Update the "Where things stand" and "Work packages" sections
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
| 2 | The world batch (the audit's placement fixes, `egret`, the nature pass's solid pieces, the 11-22 rows) | branch **`prebeta-world2`** (main and `nature-world` merged in, 11-22 night) | `docs/audit/REPORT.md`, `docs/audit/PREBETA-LIST.md` (A and the 11-22 section), the DEVLOG's "World batch" entries on that branch | **Live 11-23 (PR #25, the re-bake following):** egret; walkways clear of plants (plantOnWalk 2,914 -> 0, planterOnWalk 422 -> 0, plantOnPath -> 0); bin bags by a bin (44 -> 0); door paths round to the pavement (doorOnGrass 372 -> 89); every boat drivable (deadBoat 103 -> 3: beached canoes left as a detail); railings on the shore (railOverWater 110 -> 0); no parking space on a pavement (parked 124 -> 0); farms back from the beach (cropInTown 49 -> 0); shop signs name what's behind them (frontNames 7 -> 0); no curtain of hanging lights (festoonDensity 9 -> 0); hospital helipads on open ground (heliOffPad 10 -> 1); the arrival tunnels go into a hill (portalOnFlat 16 -> 0); pier roots on dry land (beachWater 4 -> 0); fountains and groves in the big empty plazas (bigEmptyPlaza 14 -> 0); walk-ins beside a counter at the wall get rooms (wallOnly 17 -> 12); the sea cave's rock hill (`nature-world`). Found and fixed by the whole suite on the branch: the Red Rock trailhead's 4x4s and the MX pits' trucks parked again (gravel holds a car; `parkcheck.js` parkExempt - one answer for build, lint, server: the server had never parked either, on main too), a shrunk field squared at the valley's edge, no fountain on the Waves Arena's pitch, no tree crown over a door or sign (10 -> 0), the boats' tests. Lint 42/42; the whole suite run on the branch (`docs/tasks/PREBETA-TESTS.txt`, its last section: every failure looked at); before / after pictures looked at (`tools/regress/`: the expected changes only - boats now the server's, trees drawn as other kinds as the prop list moved, one fix: the tunnel hill's shading made smaller). Going live re-bakes the art (~5 h; identical chunks carry over). **Left, why:** northDoor 19 (the Strip's and Old Downtown's casino blocks want re-planning - his call); rampCrossesRoad 9 (freeway ramps re-routed: road-network work, a pass of its own); wallOnly 12 (too small for a room, or hand-built - Greenfield Park's Lane Mart and Park West Coffee need a room laid late, with the café's tables: his say first, the arrival's first scene); doorOnGrass 89. **For Fable (art):** lobbyDoor 161 (recommendation: the apartment its own lobby door beside the shop front), signCovered 158, atmStray 52 (a booth - decided 16:45) and N18 (an ATM under an awning: awnings are picked by the art), N23 (roof billboards cut off: `client/art2/game/statics.js` billboardOnRoof - the board's lower half behind a roof drawn in front), dockOverlap 5 (the marsh boardwalk's bends want a landing piece), interiorOverlap 25 (inside a walk-in, a taller building south of it is drawn up over the room - the page should fade or cut that front while you're in), railOverWaterArt 18 (rail bridges). **Asked 16:48, open:** more bin bags outside the bins in the rough districts? |
| 3 | Systems and UI fixes, by area (NPCs, vehicles, minigames, menus) | `main` | `docs/audit/PREBETA-LIST.md` sections C-D and the 11-22 section, `docs/audit/REPORT2.md` | Batch 1 live (PR #1); N7 the quick bar live (PR #5: a strip over the weapon plate on a keyboard; touch and pad keep the wheel). Open: N13 the hospital "robbers" (confirm in play), the gridlock test (a busy four-way: a car waits 37-53 s at the head of a queue, the limit 30 - failing on main; traffic tuning). Done 11-22 night: N14 rooms lit inside at night (PR #11, client only), hudlayout (one note at a time on a small phone on its side) and the prison test (the stash) (PR #12). |
| 4 | Music and the instrument sound pack | `main` | `docs/tasks/MUSIC-HANDOVER.md` (the 11-22 sections), DECISIONS "Music and sound" | **Live 11-22 (PRs #3, #4):** all 56 approved takes as files (loop + full song, Opus + MP3); radios, tapes, car radios stream the full songs, takes rotating 70/30 in sync; shops, lobbies, drive-in, night club, casino, roadhouse loop theirs; each source its speaker sound. The debug menu's *Recorded music* turns them off on one screen. Next: the gigs and the mat to the recordings (charts from the measured beats - N9, N15, N10 tips), the city's neon bars (storefronts with no room: no music yet), the 20 optional takes when he places them. |
| 5 | Checks that stop regressions | `main` after 1 | `tools/regress/README.md` | Half built 11-22: 55 fixed places, shots and a diff (`tools/regress/`); a guard column for the 11-22 notes (their triage table). Still: a guard column for the older notes in the register. |
| 6 | Art, continued (water at sunset and in rain, then buildings and districts, then vehicles) - and from the 11-22 notes: item icons toward the concepts + a UI/UX polish on every device (N2), the hospitals' and storefronts' design (N20), the playing animations on the beat (N15) | branch `nature` | `claude/nature-status-2026-11-21.md`, the 11-22 section of the pre-beta list | For Fable. |
| 7 | Launch steps | `main` | `docs/audit/PREBETA-LIST.md` section H, `claude/launch-plan-2026-11-03.md` | On his word "launch the beta". |

Chats that can run side by side: 4 with any other; nothing else safely.

## 6. Where things stand (2026-11-23 afternoon)
**The plan the owner agreed (11-23 15:37, "this shouldn't switch directions"):** Opus 5.5 finishes everything that isn't
art, pushing as it goes; then a new chat on **Fable 5.2** does the art pass; then the cinematics are reshot and added on
the final art; then the beta's walkthrough, load test and launch. The order for the Opus part:
1. ~~Art that vanishes in view~~ (PR #29). 2. ~~Cinematics groundwork~~ (#30). 3. ~~Shadows over water~~ (#31); the water
   streaks (likely the boats' wakes) and the beach's long shadows - look in a running game first.
4. ~~Buildings covering streets~~ (P5) and 5. ~~the small mechanics~~ P6 fences hold vehicles, P7 NPCs unpinned and round
   the pool table, P9 the head bandana's flicker, P11 doors kept clear, P12 the cinematic train: **all on branch
   `heights-1123`, PR #35 - one batch, waiting for the owner's go** (P5 lowers 762 buildings; going live re-bakes the art
   ~5 h - after the 11-23 re-bake has finished; it also restarts the server once). P10 "the hoop arrow over the hoop":
   asked the owner which arrow (none found drawn at a hoop). Its DEVLOG entries say what was tested and what wasn't.
6. P8 NPC driving (police transport first; lanes, medians, unsticking, re-routing).
7. The UI pass on every screen: a harness shooting the real game's screens (pause, settings, map, phone, shops, death) at
   four sizes; the stash's desktop side-by-side to the owner's UIC-21 concept (`docs/art-v2/targets/ui/UIC-21_stash.png`).
8. The rest of `docs/audit/PREBETA-LIST.md` sections C-D (systems, finish-or-hide calls) and the balance proposals 1, 3, 4.
Then **the Fable 5.2 chat**: the art list in `docs/tasks/PREBETA-NOTES-2026-11-23.md` section 3 (and the 11-22 PDF's art
items, PREBETA-LIST "Art on Fable"), mouths (a face-stability check first), the UI art, item icons; then the cinematics
(section 2 there: reshoot, wildlife first, new behaviour scenes) and C4's variants.

**Live today (main, PRs #17-#32):** the quick bar a keyboard's only; the ellipsis and touch ammo; the Inventory (character,
clothes, underwear and socks, towels, REMOVE ALL); the stash in the Inventory (home, gun/pawn counters, hideout); press and
drag on every device; the trunk (its own slots, spills when wrecked); tile and slot polish; walk-ins dissolve (no screen
dip); the world batch (#25, its re-bake running); the triage of the 11-23 PDF; chunks never evicted in view; cinematics'
clean start, quiet page and Keep/Cut/Bug marks; no long shadows on water; the review list's check-off.
**Decisions of 11-23** (in docs/DECISIONS.md): rooms for Lane Mart and Park West Coffee; a few bags by bins in rough
districts; casinos kept, doors made to read; the stash holds items and weapons (clothes stay in the wardrobe); the trunk
its own storage, at risk; cargo crates always visible; REMOVE ALL (not "take it all off") leaves underwear on; underwear
and towels change only at home, a bathhouse or a shower.
**Known failing on main too:** scenes' live-events check, world3mesa porte-cocheres, world3wild station roads, visaudit's
picnic/cola counts; flaky: burning, happenings, calevents, world3scenes' street race (laneSpot), biz. Follow-ups: two
north doors at Northshore Beaches under trees.
**Waiting on the owner:** the balance proposals 1, 3, 4; the Pixel 7 Pro's debug line if loading is still slow; whether
clothes should go in the stash after all.

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
