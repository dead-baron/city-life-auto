# City Life Auto - master handover

**Every new chat reads this first.** The owner works in one chat per phase - pre-beta, beta, launch (11-22 02:48) -
and talks about every part of the game in it; a phase chat is restarted from this file when it grows slow. This file is
what connects them: where the truth is written down, how the owner wants work done, what state the project is in, and
what each chat must do before it ends. It is kept short on purpose; it points at the documents that hold the detail.

Last updated: 2026-11-22 morning (the pre-beta chat, Opus 5.5, first night). Update the "Where things stand" and "Work packages" sections
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
- **Nothing goes to `main` without his go-ahead.** Pushing `main` deploys live. Feature branches only. He does not
  want to be a blocker for small safe fixes (11-22 03:07): the rule for what may go without asking is in DECISIONS,
  Process - read as in force from his message of 11-22 03:23 (he can change it). In practice Claude's session can't
  push `main` (its guard refuses): a go-live is a pull request he merges.
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
| 1 | Merge and go-live of the finished art and UI | branch `prebeta-art`, **PR #1** | `docs/tasks/PREBETA-HANDOVER.md` | **Ready to merge** (11-22): tested (the 23 never-run files, the 343 fast ones again, the slow ones touching police and events; failures all pre-existing on `main`), with the first batch of the 11-22 notes in it. Claude's session can't push `main` (the permission guard refused it): the owner merges PR #1 on GitHub; it deploys and re-bakes the art once (~5 h). |
| 2 | The world batch (the audit's placement fixes, `egret`, the nature pass's solid pieces, the 11-22 rows) | branch `prebeta-world` (off `prebeta-art`), plus `nature-world` | `docs/audit/REPORT.md`, `docs/audit/PREBETA-LIST.md` (A and the 11-22 section), the DEVLOG entry "World batch, start" | **Started 11-22:** egret merged (its Egret Point overlap fixed as a class: no building with its back against a walk-in's front); walkways clear of plants (plantOnWalk 2,914 -> 0, planterOnWalk 422 -> 0, plantOnPath -> 0); the placement lint 42/42. First: the world3 suites' results (a run was started 11-22 08:10 - `docs/tasks/PREBETA-TESTS.txt` if it finished, else rerun), then the next rows (doorOnGrass 372, signCovered 158, lobbyDoor 161, railOverWater 110, deadBoat 103...), the 11-22 rows (roofSignCut, atmUnderAwning, iconOverSign, darkInterior), `nature-world`, the solid nature pieces. Before / after with `tools/regress/`. |
| 3 | Systems and UI fixes, by area (NPCs, vehicles, minigames, menus) | `main` after 1 | `docs/audit/PREBETA-LIST.md` sections C-D and the 11-22 section, `docs/audit/REPORT2.md` | Batch 1 done 11-22 (in PR #1). Open: N7 the quick bar in play (his call: an always-on strip is a new HUD element), N13 the hospital "robbers" (confirm in play), the HUD's second note on small sideways phones (`hudlayout`), the prison gun test. |
| 4 | Music and the instrument sound pack | `main` after 1 | `claude/music-briefs.md`, DECISIONS "Music and sound" | The gig screen's look fixed 11-22 (crisp pixels). Waiting on: the owner's answer recordings / rebuilt, and access to his music folder (`Desktop\City Life Auto\_audio\_DONE\City Life Auto Music and Instruments`). `docs/tasks/MUSIC-HANDOVER.md`. |
| 5 | Checks that stop regressions | `main` after 1 | `tools/regress/README.md` | Half built 11-22: 55 fixed places, shots and a diff (`tools/regress/`); a guard column for the 11-22 notes (their triage table). Still: a guard column for the older notes in the register. |
| 6 | Art, continued (water at sunset and in rain, then buildings and districts, then vehicles) - and from the 11-22 notes: item icons toward the concepts + a UI/UX polish on every device (N2), the hospitals' and storefronts' design (N20), the playing animations on the beat (N15) | branch `nature` | `claude/nature-status-2026-11-21.md`, the 11-22 section of the pre-beta list | For Fable. |
| 7 | Launch steps | `main` | `docs/audit/PREBETA-LIST.md` section H, `claude/launch-plan-2026-11-03.md` | On his word "launch the beta". |

Chats that can run side by side: 4 with any other; nothing else safely.

## 6. Where things stand (2026-11-22, end of the pre-beta chat's first night)
- `main` (live): unchanged since 2026-11-19 (the security fixes). **PR #1 (`prebeta-art` -> `main`) is ready**: merging
  it is the go-live (the owner's click; Claude's session isn't allowed to push `main`).
- `prebeta-art`: the combined art and UI, plus batch 1 of the owner's 11-22 notes (DEVLOG 11-22). Tested; see PR #1.
- `prebeta-world` (off `prebeta-art`): the world batch, started - egret merged, walkways clear. Not live; a world change.
- `nature-world`: the sea cave's rock hill - goes with the world batch.
- The 11-22 notes: triaged with their pictures (`docs/tasks/PREBETA-NOTES-2026-11-22.md`, the table: each note's ripple
  check, package and guard), in `docs/audit/PREBETA-LIST.md` (the 11-22 section). The balance audit:
  `docs/audit/BALANCE-2026-11-22.md`.
- Placeholders he wants fixed later: Summit Tarn's low sill, the sea cave's rock hill.
- Open picks waiting on him: the plants' painted light; whether the calmer water sparkle is too flat; music as
  recordings or rebuilt; the quick bar in play (N7); the balance proposals 1, 3, 4; whether the push rule as read from
  his message stands (DECISIONS, Process).
- His music and instrument kit: `docs/tasks/MUSIC-HANDOVER.md` (the folder not connected yet).

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
