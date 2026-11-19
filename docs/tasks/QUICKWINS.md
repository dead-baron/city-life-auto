# Task: the pre-beta quick wins (fix them, on this branch, for review)

The second audit's top problems a new player sees first. Read its report: `git show origin/audit2:docs/audit/REPORT2.md`
(and `origin/audit2:docs/audit/shots/` for the screenshots). Fix these, page-side only where possible (no change to
the world or its art - nothing that needs the art redrawn; server changes only if unavoidable, kept small):

## Rules (all tasks)
- Read `CLAUDE.md` and `docs/DECISIONS.md` first and follow them.
- Work only on this branch; commit as you go (small commits). **Never push to `main` and never merge into it** (pushing
  main deploys the live game). This shell has no GitHub login: do not try to push; the owner pushes the branch.
- This is a Windows checkout: `tools/stamp-version.mjs` and some tests fail here for Windows-only reasons (paths,
  line endings) - skip stamping (Claude stamps on merge) and judge tests by the ones your change touches.
- Heavy commands (building World v3, the full test suite) one at a time, `node --max-old-space-size=3072`. A local
  server only on 127.0.0.1, never a public port. Be economical: this runs on a fixed budget.
- Finish with a short summary: what you did, what you left, and anything the owner must decide.
- Each fix: a `docs/DEVLOG.md` entry; a decision line in DECISIONS.md only where the owner decided something; update
  the Guide (`shared/guide.js`) if a control or screen changes. Keep `test/perf.test.js` budgets.

## Fix, in this order (stop when the budget runs low - each is its own commit)
1. **Debug hidden from players:** the HUD debug button and the "Debug menu" row only for the owner/admins (or while
   the open dev mode is on); everyone else never sees them.
2. **The arrival:** the station sign broken onto two clipped lines ("SANDPIPER / JUNCTION FIRST") - fix the layout so
   names fit; the arrival's letterbox bars must not cut the HUD.
3. **The bag findable:** a bag/inventory button on the desktop HUD (with its key badge), and on touch an always-there
   way in (not only while holding an item).
4. **Menus in the pixel font:** the page default and every menu in the UI v2 look - CLA Pixel for headings and labels,
   one readable small face for body text where CLA Pixel is too small; no Barlow / Anton / Rubik / system fonts left
   in player screens; the consent/age gate and the Account panel restyled to UI v2 (no inline-style app look), not
   clipped on a phone held sideways; SIGN IN shown on the sideways title.
5. **Device words:** touch players never see keyboard keys ("hold F" to revive, "TAB to switch", "SPRINT") - use the
   `[[action]]` glyph system (`shared/controls.js`) everywhere; Windows touch tablets with no mouse not treated as an
   Xbox (check the input detection).
6. **The starting looks:** no pointer to a missing "Appearance" menu; no white browser scrollbar.
7. **Touch collisions on 360x740:** emote vs FIRE, chat vs FIRE ON - move into free slots; 44 px minimum targets.
8. **The red cross** on the knocked-out screen (the owner's rule: never a red cross) - and extend the test so it
   catches it.
9. **The camera tool (director):** shots that don't play their camera move, "next scene" that doesn't move to the
   next shot, and shots of NPCs actually playing their games (pool, cards, hoops...) - the owner records trailers
   with it.

Then list what you didn't get to.
