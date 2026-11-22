# City Life Auto - master handover

**Every new chat reads this first.** The owner works in one chat per work package and moves between them. This file is
what connects them: where the truth is written down, how the owner wants work done, what state the project is in, and
what each chat must do before it ends. It is kept short on purpose; it points at the documents that hold the detail.

Last updated: 2026-11-22 (end of the Fable art session). Update the "Where things stand" and "Work packages" sections
at the end of every chat.

## 1. How a chat starts
1. Read this file, then `CLAUDE.md` and `docs/DECISIONS.md` (the rules say so too), then the handover for the package
   you are picking up (section 5).
2. Read the owner's opening message. It names the package. If he brings notes for other areas, log them (section 4);
   don't act on them in this chat unless he says so.
3. Before planning anything, check the waiting branches for work that already covers it (`git branch -r`,
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
- **Nothing goes to `main` without his go-ahead.** Pushing `main` deploys live. Feature branches only.
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
- About this chat's package: act on it.
- About anything else (a UI note during world work, a gameplay idea, a bug seen in passing): **log it, don't act.**
  Add it to `claude/prebeta-list.md` (before the beta) or `claude/postlaunch-fixes.md` / DECISIONS "Future features"
  (after), with the date and his words, and tell him in one line where it went.
- A decision ("let's do X", "I prefer B") goes into `docs/DECISIONS.md` with the date and his words, in the same
  commit as the work it governs, whichever package it belongs to.

## 5. Work packages (one chat each, one at a time unless they share no files)
| # | Package | Starts from | Read first | State |
|---|---|---|---|---|
| 1 | Merge and go-live of the finished art and UI | branch `prebeta-art` | `docs/tasks/PREBETA-HANDOVER.md` | Ready. 25 test files not yet run; four UI checks from quick wins to settle; a clean full run owed. |
| 2 | The world batch (the audit's placement fixes, `egret`, the nature pass's solid pieces) | `prebeta-art` after 1, plus `nature-world` | `docs/audit/REPORT.md`, `claude/prebeta-list.md` section A, the handover's "what comes next" | Not started. One world rebuild. |
| 3 | Systems and UI fixes, by area (NPCs, vehicles, minigames, menus) | `main` after 1 | `claude/prebeta-list.md` sections C-D, `docs/audit/REPORT2.md`, the owner's new notes | Not started. One chat per area; merge each before the next. |
| 4 | Music and the instrument sound pack | `main` after 1 | `claude/music-briefs.md`, DECISIONS "Music and sound" | Waiting for the owner's files. To decide: remade in the engine or played as audio. For rhythm games: each song's tempo and where beat one falls. |
| 5 | Checks that stop regressions (a guard per note; a fixed set of places re-rendered before and after any world or art change) | `main` after 1 | the handover's "Two checks worth building first" | Not started. Worth doing early: it saves his usage. |
| 6 | Art, continued (water at sunset and in rain, then buildings and districts, then vehicles) | branch `nature` | `claude/nature-status-2026-11-21.md` | Paused until he returns to the art model. |
| 7 | Launch steps | `main` | `claude/prebeta-list.md` section H, `claude/launch-plan-2026-11-03.md` | On his word "launch the beta". |

Chats that can run side by side: 4 with any other; nothing else safely.

## 6. Where things stand (2026-11-22)
- `main` (live): unchanged since 2026-11-19 (the security fixes).
- `prebeta-art`: characters, animals, item pictures, quick wins, the fullscreen row, the audit reports and all
  page-side nature and water work, merged and stamped. Not live. The owner has seen sheets and area pictures, not the
  running game.
- `nature-world`: the sea cave's rock hill (a world change). A placeholder by his word; goes with the world batch.
- Placeholders he wants fixed later: Summit Tarn's low sill, the sea cave's rock hill.
- Open picks waiting on him: the plants' painted light; whether the calmer water sparkle is too flat; go-live.

## 7. How a chat ends (do all of it, in this order)
1. Tests for what changed pass; say which were not run.
2. Stamp, commit, push the feature branch. Nothing left uncommitted.
3. New decisions are in `docs/DECISIONS.md`; a DEVLOG entry for each feature; notes for other areas are logged.
4. Update sections 5 and 6 of this file, and the package's own handover.
5. Copy this file to the project (`claude/master-handover.md`) so the next chat sees it wherever it starts.
6. Give the owner the opening message for the next chat, like this:

   > Read `docs/MASTER-HANDOVER.md` on branch `<branch>` (project copy: `claude/master-handover.md`), then
   > `<the package's handover>`. I'm coming from the `<previous package>` chat. This chat is for `<package>`.
   > Start with `<first concrete step>`. Notes I'm bringing: `<his notes, or "none">`.
