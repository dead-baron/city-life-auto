## 2026-10-26 - The page's code budget: 498 -> 520 KB, after a trim pass (467.9 KB)

The page's code (tools/perf.mjs `page`: what client/boot.js and client/main.js load before the title screen and PLAY,
gzipped) was full at 498.2 of 498 KB, so every feature had to trim something first. Claude proposed, and the owner
agreed ("Sure"), to raise the budget to 520 KB - room for the next features instead of a trim each time - and to do a
trim pass first, moving what the title screen and the first play don't need out of the page.

### What moved
- **The game numbers the page reads, out of shared/rules.js** (-30 KB). The page loaded all of shared/rules.js (81 KB,
  30.5 KB gzipped) for twelve numbers: `NPC_CRITICAL` (main.js), `CALM_PROMPT_S`, `CALM_HUD_S`, `SAFETY_CONFIRM_S`
  (hud.js), `POLICE_ARMORY` (interiors.js), `TANKER_BLAST`, `EXPLOSIVES_BLAST` (shared/explosions.js), `BATTERY_S`,
  `FLARE_S`, `GLOWSTICK_S` (shared/lights.js), `FERRIS_S` (shared/rides.js) and `SKILL` (shared/skills.js). They now
  live in **shared/rules-page.js**, and those seven files import them from there. shared/rules.js re-exports every one
  with its note, so it stays the one place to import game numbers from - the server, the tests and the tutorial read
  the same values as before (the same way shared/rules-base.js and rules-games.js were split off). None of these files
  is in the art's, the world's or World v3's hash, so nobody's kept city or chunks are thrown away.
- **The install help sheet** (-0.9 KB): its steps for each browser, the "already installed?" help and Repair install
  moved to **client/installhelp.js**, loaded the first time Install (title screen, Settings, the hub) or Repair is
  pressed; the sheet fills and opens once it's here, so the first press isn't lost. The browser's own install prompt
  stays in main.js (it must be shown inside the press).

Most of the other candidates were already lazy: the character creator, the phone and the hub's apps, the bag, the debug
menu, the free camera, the job card. The page is now 81 files, 467.9 KB of 520.

### The biggest thing left on the page
The classic renderer (client/render/*, about 160 KB gzipped of the page) is the fallback art (`?art=1`, or when the
v2 renderer can't start); parts of it (the effects, the explosions, the trains' overlays) draw over art v2 too. Lazy
loading the rest is the next big trim if the budget fills again, but it is tangled into main.js's drawing and needs its
own pass.

### Tests
- test/lazypage.test.js: the page leaves shared/rules.js and client/installhelp.js out of its start-up code, main.js
  loads the help when first opened and fills the sheet after it's here, and rules.js re-exports every number of
  rules-page.js with the same value.
- tools/perf.mjs: `page.kb` 498 -> 520 with the reason.
