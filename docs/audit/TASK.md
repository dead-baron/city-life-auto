# Task: the whole-game audit (run headless with the API; the owner, 11-19)

You are auditing City Life Auto, a web multiplayer top-down city game (authoritative Node server in `server/`, page in
`client/`, shared code in `shared/`, World v3). The owner has found many issues by playing and fears more: things fixed
in one spot but not world-wide, placeholder art, unfinished systems. **Your job is to FIND and REPORT, not to fix.**
Read `CLAUDE.md`, `docs/DECISIONS.md` (the owner's rules) and `docs/audit/PREBETA-LIST.md` (every known issue, with the
check each one needs) first.

## Hard rules
- Work only on this branch (`audit`). Commit your work here as you go (small commits). **Never push to `main`** (it
  deploys the live game) and never merge. Pushing this branch (`git push origin audit`) is fine at the end.
- Don't change game behavior. You may add check code (lint rows, scripts under `tools/audit/`, tests that report) and
  the report. If a check would need a real fix to pass, report it - don't fix it.
- Heavy commands (building World v3, the full test suite) are slow and use ~3 GB: run one at a time, with
  `node --max-old-space-size=3072`. Don't start the game server on a public port.
- Be economical: this runs on a fixed budget. Prefer one script that builds the world once and runs every check over
  many runs; don't re-read big files; stop and write the report if you've done the main parts.

## What to produce
1. **World checks** - add rows to the placement lint (`tools/placementlint.mjs`, the same style as its existing rows;
   `test/placementlint.test.js` keeps a baseline count per row) for each check named in PREBETA-LIST section A and C
   that can be computed from the built map: `plantOnWalk`, `northDoor`, `interiorOverlap`, `wallOnly`, `doorOnGrass`,
   `frontNames` (a front's words vs its business), `lobbyDoor` (a business front whose door is a home/lobby),
   `signCovered`, `rampCrossesRoad`, `railOverWater`, `dockOverlap`, `railOverWaterArt`, `portalOnFlat`,
   `festoonDensity`, `cropInTown` (crop fields in towns / beach lots), `heliOffPad`, `deadBoat`, `bigEmptyPlaza`
   (open paved areas larger than about a screen with little in them), plus any other world rule in DECISIONS.md that a
   check can test. Set each new row's baseline to today's count (so tests pass) and list every hit.
2. **Placeholder and unfinished scan** - in `client/` and `shared/`: art drawn as plain shapes where the game has real
   art elsewhere (fillRect/arc/ellipse sprites for game objects: balls, pads, goals, markers, cones, cards, chips,
   debris), comments saying placeholder / stand-in / TODO / for now / not yet / later, features behind flags that are
   off, menus that stand in for minigames (the casino tables), Guide entries for things that don't exist. List each
   with file:line and what it is.
3. **Systems check** - for each activity and system (driving, boats, kayak, skateboard, tennis, car soccer, racing,
   casino, pool, fishing, jobs, shops/wardrobe, the character creator, homes, transit, the phone and Guide, the death
   screen, sign-in): read its code and tests and note what's missing or half-built against the owner's notes in
   PREBETA-LIST and DECISIONS. One short paragraph each. Run `npm test` once and list any failures.
4. **The report**: `docs/audit/REPORT.md` - a summary table first (check / count / severity), then per check: what it
   finds, the count, the top 20 locations (district name and tile coordinates), and the suggested fix; then the
   placeholder list; then the systems notes; then "things I couldn't check automatically" (needs eyes in the game).
   Also `docs/audit/hits.json` with every hit (check, x, y, district, note) for the fix pass to use.

Finish by committing everything on `audit`, pushing the branch, and printing the report's summary table.
