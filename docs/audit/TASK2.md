# Task 2: the plan-coverage and UI audit (run AFTER the first audit has finished and pushed `audit`)

Same job and rules as `docs/audit/TASK.md` (find and report, don't fix; never push to `main`; heavy commands one at a
time with `--max-old-space-size=3072`; be economical). Work on this branch (`audit2`). **First:**
`git fetch origin && git merge origin/audit` so you have the first audit's checks and report; read
`docs/audit/REPORT.md` and don't repeat what it found. Write `docs/audit/REPORT2.md`; at the end push `audit2`.

## Part A - the plan vs the game (what's in, what's partly in, what's missing)
The owner's plans live outside the repo; these are the parts to check. For each item give a status (Done / Partial /
Missing / Can't tell) with the code that shows it (file:line) and one line on what's missing.

1. **The design plan (owner-approved 11-05):** a goal ladder - a "What's next" phone app, daily/weekly goals, career
   ranks per path with visible unlocks (crime: hustler to kingpin; police: rookie to chief; business: vendor to
   tycoon); named contacts with 5-10-mission chains ending in a payoff (one each for crime, police, honest); extraction
   as the headline loop (valuable cargo carried visibly on open vehicles, most big money through that risk); scheduled
   world events announced on the phone (armored truck leaving in 5 min, gang war at the docks, district crackdown);
   seasons (resets, themes, leaderboards, carried cosmetics); visible consequences (district reputation, shopkeepers
   refusing known robbers, police recognizing repeat offenders, NPCs thanking Samaritans); money sinks (property
   upkeep, vehicle insurance, cosmetics/status items); a beta-tester gift that survives the wipe.
2. **The FTUE** (`CLAUDE.md` section): arrival by train at a chosen station, the one question, a first goal of at most
   three steps, the first car by the answer's path, first-time moments, the phone's Guide as the wiki - and that every
   system, place, job and control has a Guide entry (`shared/guide.js`); list the ones that don't.
3. **The launch plan's systems:** admin roles and the admin log, admin "angel" arrival (not built), the safe exit
   (LOG OFF countdown), guest limits, usernames, the transfer code, chat channels (proximity, crew, faction, phone) and
   moderation, analytics consent, the age gate, ads on the death screen, a donate/tip link.
4. **The game design document's open rows** (search `docs/DECISIONS.md` and `docs/DEVLOG.md` for each to see if it
   was done since): road tunnels in World v3; the subway's two-sided stations; the main line at street level in poorer
   districts; crafting tables with a preview (CW1-CW2); item icons for every material (IC1-IC5); the gym and its
   minigame, the riding skill; tier-4 homes that are businesses; home upgrades; the house-tour exploit; bathing,
   toilet, mowing at home; card rooms / poker vs players; cockfights (should NOT exist - flag if it does); skates,
   longboards, BMX, skate contests; bathhouses; the censored-nudity setting; fallback art without WebGL2; the in-game
   map picture for World v3; crew events; more servers; grow rooms; prison yard inmates and the Prison Boat; NPC
   farm hands and saved fields; lavender picking; boat hire docks (how many of 7); balloon routes (how many of 3);
   NPC chess spots; the ideas list of 10-24 (feeding ducks, Crazy Taxi mode, boombox/radio/tapes, breakdancing,
   park ranger job, big rigs and trucker job, build-a-campfire, fireworks, chess tables, homeless man with a cart,
   mail delivery job, NPC workers, instruments, forklift job, fishing boat job), caves with real art and dark parts,
   waterfalls and cliffs by hand, surf waves that curl, the big Neon Strip arcade with shared tickets, sliding doors
   and shop bells, building dressing (graffiti, fire escapes, vines, balconies), all concept outfits in the game.
5. **The art audit (11-03) top gaps** - check each is fixed: sign lettering that breaks on the art grid (`signBoard`
   sy 3 / sx 1; a sign test exists?), sign faces and colours by trade (not the random `SIGNC` deal), the floating
   badge covering the sign and no red cross anywhere, trade-specific shopfronts and window goods (not one rainbow
   shelf), varied roofs (AC rows on under 40%), dressed shop interiors (30%+ floor coverage), banks (portico, marble,
   teller glass, vault door), the Rusty Spur's MC3 look, clinic/hospital fronts lit at night, people's proportions and
   faces, distinct bar interiors (lounge, tavern, sports bar, the biker saloon), motorcycles and cars' finish, night
   signs outside the Strip, plazas with a focal piece and seating.

## Part B - the UI audit (the 10-24 review's findings: check each is fixed, and find new ones)
1. **One visual system:** list every place still using the old styles - the "GTA v1" pink/purple gradients
   (`--accent #ff3e8a`, `--accent2 #7a3cff`) and Anton / Barlow Condensed, the "app style" (Rubik - check whether a
   `@font-face` loads it now; if not, everything naming it falls back to Arial), `system-ui` / `monospace` / `serif` /
   `sans-serif` in CSS and canvas text (`font =` in `client/`), and panels styled inline in JS. The target is UI v2:
   navy panels with a gold rim and the CLA Pixel face. The owner (11-17): menus that aren't in the SNES font.
2. **Tokens:** count hard-coded colours, golds/yellows, reds, money greens, font sizes and radii in `client/style.css`
   and inline styles; list the worst offenders.
3. **Touch:** interactive elements under 44 px; buttons overlapping the sticks or each other (flight up/down on the
   left stick, the FIRE toggle on the aim ring, HORN in the left thumb zone); safe-area insets on bottom/right buttons;
   anything in the top-centre or over the play area on a phone held upright.
4. **Wording and hints:** keyboard words on touch ("SPRINT", "TAB to switch"), the leading colon on prompts, jargon
   ("SAM", "EXP"), settings rows for the wrong device, the same screen with several names (Options / Settings / SYS),
   debug text visible to players (`#net` fps line, "Debug menu" first in pause), controls with no on-screen hint
   (aircraft climb/descend, handbrake, horn, sprint, block, shortcuts).
5. **Screens:** the phone (icon grid? app name in the header?), the bag / inventory (findable? - the owner couldn't
   find it 11-17), the quick wheel, the weapon picker (a close button?), the pause menu (Resume first, fits 390 px
   tall?), settings (tabs, device filtering), the shop panel over the minimap, the death screen (cause on touch, spawn
   map clickable on desktop - fixed 11-17), the cinematic panel on phones, the character creator (saved looks: see
   PREBETA-LIST), starting looks on a phone held upright.
6. If a headless browser works on this machine (Playwright / Chromium), take screenshots of the main screens at
   1440x900, 844x390 and 390x844 against a local server (`CLA_WORLD=v3 PORT=8091 node server/index.js`, never a public
   port) and include the worst ones in `docs/audit/shots/`. If it doesn't, say so and skip.

## The report
`docs/audit/REPORT2.md`: Part A as tables (item / status / evidence / what's missing), Part B as a list by screen with
severity, then "top 20 things to do before the beta" ranked by how much a new player would notice them.
