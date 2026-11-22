# City Life Auto - audit 2: the plans vs the game, and the UI (2026-11-19)

Find-and-report pass, run after the first audit (`docs/audit/REPORT.md`, merged from `audit`); nothing found there is
repeated here (it is referenced where it matters). Nothing in the game changed. Part A checks the owner's plans item by
item against the code; Part B is the UI audit (the 10-24 review's findings rechecked, new ones found), with screenshots
from a local server in `docs/audit/shots/`. Every status was read from the code (file:line), not taken from the docs.

## Top 20 things to do before the beta (ranked by how much a new player would notice)

| # | What | Where | Part |
|---:|---|---|---|
| 1 | **Menus aren't in the pixel font.** `html, body` default to `--ui` (Barlow Condensed): 164 uses, every menu's body text, and 5 in the in-play HUD against the 11-12 "CLA Pixel everywhere in the HUD" decision. The owner's 11-17 complaint. Swap the default and fix the shared parts first (`.btn`, `.row`, `.tab`, `.chip`...) | `client/style.css:2,68,92,101-191`; HUD `:583-584,621,649,744` | B1 |
| 2 | **The first screen is the old "app" look.** The age/consent gate and the Account panel are 76 inline styles (`system-ui`, grey box, blue buttons); repainted only in the title slot. At 844x390 the gate's title is cut off at the top (shot `844-age-gate.png`) | `client/account.js:66-69,129-135,357-406` | B1, B6 |
| 3 | **Debug things every player sees:** the 🐞 button beside the minimap on every HUD (in every in-game shot), and "Debug menu" in Settings > Help (sends `devmode` with an empty password, gets a refusal) | `index.html:47,278`; `client/hub.js:72-73`; `client/main.js:1601` | B4 |
| 4 | **The starting-look card sends you to "the menu (Appearance)"**, which doesn't exist; its carousel shows the browser's white scrollbar under the navy panel (shot `1440-starting-look.png`) | `client/creator.js:555,82-86` | B4, B6 |
| 5 | **The bag can't be found** (the owner, 11-17): no HUD button on desktop (I key / MENU > BAG only); on touch ITEMS shows only while you hold an item; called ITEMS on the button, BAG everywhere else | `shared/touchcontrols.js:16`; `client/touchslots.js:179`; `index.html:185` | B5 |
| 6 | **A sign split onto two clipped lines** in a new player's first view: "SANDPIPER / JUNCTION FIRST" (the first-aid front by the desert spawn, under the "Where to?" card; shot `1440-ftue-where-to.png`). `test/signs.test.js` says every World v3 sign fits - this one doesn't; find which path draws it | shot; `client/art2/signfont.js`, `test/signs.test.js:129` | A5, B6 |
| 7 | **The arrival's letterbox cuts the HUD in half** (minimap and the round buttons sliced by the top bar) instead of hiding it (shot `1440-ftue-where-to.png`) | `client/ftue.js` / the cinematic bars | B6 |
| 8 | **Touch buttons collide on a 360x740 phone** (common Android, not in `test/hudlayout.test.js`): emote runs into FIRE, chat touches FIRE ON (0 px) - fixed CSS offsets, not `slotGeometry`. FIRE ON is ~14 px from the aim stick on every phone | `client/style.css:379-385`; `client/touchslots.js:34` | B3 |
| 9 | **Keyboard words on touch:** "hold F to finish them" (revive), the cinematic panel and tour toasts list keys (Esc, Q/E, F2...) | `server/systems/revive.js:230`; `client/director.js:359,470,712-740` | B4 |
| 10 | **A red cross on the knocked-out screen** (the ambulance marker), against the no-red-cross rule; the test's source guard misses it (`fillRect`, not `cross =`) | `client/deathscreen.js:349-352`; `test/storeicons.test.js:48` | A5 |
| 11 | **The Guide is missing ~45 things** beyond REPORT 2.5: 9 jobs (trucker, charter pilot, SAR, coast guard, dusting, fishing boat, firewood...), fighting/weapons, flying/skydiving, hunting, foraging, picking, horses, swimming (DECISIONS:157 says it's there), music, rides, ~30 place kinds; 21 of 40 controls never named | `shared/guide.js:84-200`; list in A2 | A2 |
| 12 | **Upright phones: the play area fills with buttons.** The right cluster reaches y 408 of 844 (ui0 had kept it under 548); the prompt card sits right under the player; the cinematic panel covers 290 of 390 px | `client/touchslots.js:34-35,84-85`; `client/director.js:271` | B3, B5 |
| 13 | **Shopfronts are still one rainbow shelf** for generic walk-ins (pharmacy, hardware, grocery, sports, tackle -> `'mart'`); clothing and barbers show the hotel lobby | `client/art2/game/statics.js:472-474`; `client/art2/buildings.js:921-925` | A5 |
| 14 | **AC rows on almost every flat roof** (no chance roll; the 11-03 target was under 40%) - the city from above looks copy-pasted | `client/art2/game/statics.js:657-718` | A5 |
| 15 | **First-time moments stop at 8**: nothing for the first job, police duty, a home, hot money, swimming/boats, What's next | `server/systems/ftue.js:70-79` | A2 |
| 16 | **Two palettes side by side**: the 10-24 `--navy/--gold` and UI v2's `--pad-navy/--pad-gold` are near twins, so HUD plates and menus differ; 9 gold tokens in CSS and ~40 hand-typed golds in canvas code (none a token); 8 money greens | `client/style.css:14-15` vs `39-45` | B2 |
| 17 | **Small touch targets**: chat chips 34 px, chat/emote tabs 36 px, What's next skip 30 px and goal buttons 32 px | `client/chat.js:76,101,141-155`; `client/emotes.js:126`; `client/whatsnext.js:40,46,54` | B3 |
| 18 | **On a phone held sideways the title has no SIGN IN** (and no Samaritan line): the 844x390 title lists every button but `t-signin` (shot `844-title.png`) | `client/titlescreen.js` / title CSS for short screens | B6 |
| 19 | **Windows touch tablets are treated as an Xbox** (coarse pointer, no fine one): pad hints ("A SELECT / B BACK") and "Detected an Xbox" in Settings - seen with touch emulation (shot `844-settings.png`); check a Surface without its keyboard | `client/platform.js:17-21` | B6 |
| 20 | **FTUE paths don't do what they say**: "The great outdoors" promises a pickup but gives cash with nothing pointing at the pickup (DECISIONS:277); "A little hustle" says "meet a contact" but the goal is the fence / gang HQ | `server/systems/ftue.js:60-65,158-161,339`; `shared/rules.js:147` | A2 |

Just under the line: the cinematic tips and quick wheel on small phones (B4/B5), the bars' and boutiques' thin
interiors (A5 gap 6), narrow banks without a portico (A5 gap 7), the unreachable censored-nudity setting (A4), Season 1
with no content and the weekly crate paid as cash (A1), the Prison Boat not running (A4).

## Summary of Part A

| Plan | Done | Partial | Missing | Can't tell |
|---|---:|---:|---:|---:|
| A1 Design plan (11-05) | 13 | 2 (weekly crate paid as cash; Season 1 has no content) | 0 | 0 |
| A2 FTUE | 7 | 3 (first-time moments, Guide coverage, controls in the Guide) | 0 | 0 |
| A3 Launch systems | 9 | 2 (LOG OFF hotel rooms; age gate not enforced by default) | 2 (angel - expected; death-screen ads - by decision) | 0 |
| A4 Design-document open rows | 33 (cockfights absent, as wanted) | 9 | 3 (riding skill, crew events, more servers) | 3 |
| A5 Art audit (11-03) gaps | 3 | 9 | 2 (roofs, vehicle finish) | 0 |

The progression plan is essentially built (careers with enforced unlocks, What's next, goals, six contacts, extraction
paying 10-20x jobs per half hour, six scheduled events, reputation with all four consequences, three sinks, the beta
gift). What lags is teaching (the Guide and first-time moments) and the art audit's non-sign gaps, most of which never
got their own wave (no wave B, C or E entry in the DEVLOG).

# Part A - the plan vs the game

