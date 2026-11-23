# City Life Auto - master handover

**Every new chat reads this first.** The owner works in one chat per phase - pre-beta, beta, launch (11-22 02:48) -
and talks about every part of the game in it; a phase chat is restarted from this file when it grows slow. This file is
what connects them: where the truth is written down, how the owner wants work done, what state the project is in, and
what each chat must do before it ends. It is kept short on purpose; it points at the documents that hold the detail.

Last updated: 2026-11-22 afternoon (the pre-beta chat, Opus 5.5). Update the "Where things stand" and "Work packages" sections
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
| 2 | The world batch (the audit's placement fixes, `egret`, the nature pass's solid pieces, the 11-22 rows) | branch **`prebeta-world2`** (on `prebeta-world`; merge `main` into it before it goes), plus `nature-world` | `docs/audit/REPORT.md`, `docs/audit/PREBETA-LIST.md` (A and the 11-22 section), the DEVLOG's "World batch" entries on that branch | **Under way (11-22):** egret merged; walkways clear of plants (plantOnWalk 2,914 -> 0, planterOnWalk 422 -> 0, plantOnPath -> 0); bin bags by a bin (44 -> 0); door paths round to the pavement (doorOnGrass 372 -> 89); every boat drivable (deadBoat 103 -> 3 - his call 15:03); railings back on the shore (railOverWater 110 -> 0); no parking space on a pavement (parked 124 -> 0); stray crop scraps to grass (cropInTown 49 -> 23); the staged bear finds its bank. Lint 42/42. **For Fable (art):** lobbyDoor 161 (mixed-use buildings painted as a shop with only an apartment inside - recommendation: the apartment its own lobby door beside the shop front), signCovered 158 (hotel and fuel canopies over their own signs). **His calls:** atmStray 52 (kiosks that are a street's only cash: a booth of their own - Claude's pick, art - or removed), Gull Harbor's farms inside its district (cropInTown 23). Next rows, no art: wallOnly 17, northDoor 19, interiorOverlap 25, portalOnFlat 16, bigEmptyPlaza 14, heliOffPad 10, festoonDensity 9, rampCrossesRoad 9, frontNames 7, dockOverlap 5, beachWater 4; the 11-22 rows (roofSignCut N23, atmUnderAwning N18, darkInterior N14); then the world3 suites again, before / after pictures (`tools/regress/`), and his word to go live. |
| 3 | Systems and UI fixes, by area (NPCs, vehicles, minigames, menus) | `main` | `docs/audit/PREBETA-LIST.md` sections C-D and the 11-22 section, `docs/audit/REPORT2.md` | Batch 1 live (PR #1); N7 the quick bar live (PR #5: a strip over the weapon plate on a keyboard; touch and pad keep the wheel). Open: N13 the hospital "robbers" (confirm in play), N14 the hospital dark inside at night (started: how walk-in rooms get their light), the HUD's second note on small sideways phones (`hudlayout`, failing on main too), the prison gun test. |
| 4 | Music and the instrument sound pack | `main` | `docs/tasks/MUSIC-HANDOVER.md` (the 11-22 sections), DECISIONS "Music and sound" | **Live 11-22 (PRs #3, #4):** all 56 approved takes as files (loop + full song, Opus + MP3); radios, tapes, car radios stream the full songs, takes rotating 70/30 in sync; shops, lobbies, drive-in, night club, casino, roadhouse loop theirs; each source its speaker sound. The debug menu's *Recorded music* turns them off on one screen. Next: the gigs and the mat to the recordings (charts from the measured beats - N9, N15, N10 tips), the city's neon bars (storefronts with no room: no music yet), the 20 optional takes when he places them. |
| 5 | Checks that stop regressions | `main` after 1 | `tools/regress/README.md` | Half built 11-22: 55 fixed places, shots and a diff (`tools/regress/`); a guard column for the 11-22 notes (their triage table). Still: a guard column for the older notes in the register. |
| 6 | Art, continued (water at sunset and in rain, then buildings and districts, then vehicles) - and from the 11-22 notes: item icons toward the concepts + a UI/UX polish on every device (N2), the hospitals' and storefronts' design (N20), the playing animations on the beat (N15) | branch `nature` | `claude/nature-status-2026-11-21.md`, the 11-22 section of the pre-beta list | For Fable. |
| 7 | Launch steps | `main` | `docs/audit/PREBETA-LIST.md` section H, `claude/launch-plan-2026-11-03.md` | On his word "launch the beta". |

Chats that can run side by side: 4 with any other; nothing else safely.

## 6. Where things stand (2026-11-22, afternoon)
- `main` (live): PRs #1-#5 merged 11-22 - the pre-beta art and UI with batch 1 of the 11-22 notes, the new people, the
  owner's music in the world, the quick bar. The art re-bake from PR #1 runs about five hours from 11:45.
- `prebeta-world2` (on `prebeta-world`): the world batch so far (section 5, row 2). Not live; his word before it goes.
- `nature-world`: the sea cave's rock hill - goes with the world batch.
- The 11-22 notes: triaged (`docs/tasks/PREBETA-NOTES-2026-11-22.md`), in `docs/audit/PREBETA-LIST.md`.
- Placeholders he wants fixed later: Summit Tarn's low sill, the sea cave's rock hill.
- Open picks waiting on him: whether the calmer water sparkle is too flat (in play now); the balance proposals 1, 3, 4.

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
