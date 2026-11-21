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

### A1 The design plan (PROGRESSION.md, owner-approved 11-05/11-07)

| Item | Status | Evidence | What's missing |
| --- | --- | --- | --- |
| "What's next" phone app | Done | `client/phone.js:69,140-143` (first app); `server/systems/whatsnext.js:1-27,198-201` (three cards, pluggable sources); `client/whatsnext.js` | - |
| Daily / weekly goals | Partial | `server/systems/goals.js:1-14`; `shared/rules.js:82-104` (3 daily, 1 weekly, streak, 1 reroll) | The weekly's crate isn't delivered home: it's paid as cash (`goals.js:120-129`) |
| Career ranks per path, visible unlocks | Done | `shared/rules.js:27-57` (Corner Kid..Kingpin, Recruit..Chief, Vendor..Tycoon, each with unlocks); `server/systems/careers.js:270` rankUp (title card); unlocks enforced e.g. `crews.js:232`, `heistjobs.js:49`, `k9.js:211`, `biz.js:97` | - |
| Named contacts with mission chains + payoff | Done | `shared/rules-contacts.js:50,98,146,189,233,281` (Rosa, Okafor, Mae, Deacon, Reyes, Lin; 7-8 missions each, `end:` payoffs at `:80,128,172,217,264,308`); `server/systems/contacts.js:1-30,482` | - (all six, more than the one-per-career asked) |
| Extraction as headline loop (visible cargo, big money) | Done | `server/systems/extract.js:1-19` (paid only on delivery; gold on every map); `shared/rules.js:892-893` CRATE_PAY 300/1200/3200/8000; open slots e.g. `shared/vehicles.js:21` flatbed; `server/systems/cargo.js:1-2` | Money check OK: an armored run is 2 gold = $16,000 per 30 min (fence) vs a wood job ~$450-750 (`shared/rules-play.js:94`), bus/tow/mail tens-to-hundreds a stop (`shared/rules.js:1236-1259`) |
| Scheduled world events announced on the phone | Done | `shared/rules.js:897-904` (armored 30 min, dock hourly, gang war 3/day, crackdown daily, race night, soccer cup - all `on: true`); `server/systems/calendar.js:19,334-338` (city feed "Coming up" countdown + What's next card); `server/systems/calevents.js` | Gang war is at a gang hideout block, not "the docks" (design example only) |
| Seasons (resets, themes, leaderboards, carried cosmetics) | Partial | `server/systems/seasons.js:1-16` (owner-ended, epoch reset, boards, top-10 gold plate, skills kept at 50%); `shared/rules.js:1105-1110` | Season 1 has a name/theme only: `mods: {}`, no limited cosmetic set or new contact/event authored |
| District reputation | Done | `server/systems/reputation.js:1-15,96-121` (per district, -100..100, fades); Skills app panel `:261` | Owner's name on a storefront sign deferred (`reputation.js:16`, needs a bake) |
| Shopkeepers refusing known robbers | Done | `reputation.js:132` adjustMenu via `server/systems/economy.js:219`; shotgun `reputation.js:155`, `robbery.js:185` | - |
| Police recognizing repeat offenders | Done | `reputation.js:160` knownOffender, used `server/systems/law.js:641` | - |
| NPCs thanking Samaritans | Done | `reputation.js:197,211` (waves / thank-you lines); vouch `reputation.js:168`, `law.js:418` | - |
| Sink: property upkeep | Done | `server/systems/upkeep.js:1-6`; `shared/rules.js:1119` UPKEEP (shabby 3 d, repo 7 d, 50% back); ticked `server/world.js:260` | Repo refund 50% still OPEN for the owner (DECISIONS:300) |
| Sink: vehicle insurance | Done | `server/systems/insurance.js:1-12`; `shared/rules.js:1127`; menus `economy.js:365,377,637` | - |
| Sink: cosmetics / status items | Done | `shared/rules.js:1129-1136` COSMETICS (name colors, plates, paint; cash or tokens); `server/systems/cosmetics.js:1-23` | - |
| Beta-tester gift that survives the wipe | Done | `server/systems/cosmetics.js:13-18,99-105` (Founding Citizen jacket + card-only Beta plate); kept by `server/store.js:57` (cosm, wardrobe kept on reset) | Kept per profile through `resetProfile`; works as long as a wipe goes through it (not a delete) |

### A3 The launch plan's systems (11-03)

| Item | Status | Evidence | What's missing |
| --- | --- | --- | --- |
| Admin roles | Done | `server/roles.js:1-16` (owner/admin/helper, POWERS); `client/adminpanel.js`; `server/admin.js` | - |
| Admin log (append-only, hash-chained) | Done | `server/adminlog.js:1-8,13` (sha256 chain + head file, verify); `server/admin.js:3` (done and refused actions logged) | - |
| Admin "angel" arrival | Missing (expected) | No "angel" in `server/` or `client/` beyond fish; DECISIONS:57 "not built". The founder's look has cyan wings (`server/founder.js`), but no beam/invulnerable arrival | Whole feature |
| Safe exit (LOG OFF countdown) | Partial | `server/systems/logoff.js:1-15,60`; `shared/rules.js:328` LOGOFF { countS 10, calmS 60 } | Not instant in a hotel room: the game has none (`server/systems/homes.js:503-504`) |
| Guest limits | Done | `server/systems/crews.js:31-36,232,252`; `server/systems/bounties.js:97-103`; tighter chat `server/chat.js:47`, `shared/chatdefs.js:15` | Enforced only while a sign-in provider is on (by design) |
| Usernames | Done | `shared/names.js:4` NAME { 3-16, gap 600 s, holdH 24 }; `server/launch.js:146,192`; `server/accounts.js:23` (free renames, 11-15) | - |
| Guest transfer code | Done | `server/accounts.js:24,166-173` (10 min, one use); `client/account.js:324-337` | - |
| Chat channels (proximity, crew, faction, phone) | Done | `shared/chatdefs.js:9` CHANNELS; `server/chat.js:1-24`; biker faction off by flag `shared/chatdefs.js:103` (decided) | - |
| Chat moderation (filter, mute, report, block, strikes) | Done | `server/chatfilter.js`; `server/moderation.js:5-6,22`; `shared/chatdefs.js:26` (3 strikes = 24 h); `server/chat.js:11,25-27` (contact masking, fishing to Review) | - |
| Analytics + consent | Done | Self-hosted `server/analytics.js:1-6,29` (730 days); consent at first launch `client/account.js:133-141`; GA Consent Mode `client/analytics.js:7,54-57` | Stale comment `analytics.js:5` says "the last 90" days |
| Age gate | Partial | Page gate `client/account.js:127-141` (13+, shown when `gateNeeded`); server check `server/launch.js:102,117` | Server enforcement off by default (`server/config.js:83` CLA_REQUIRE_AGE '0') - see REPORT.md 3 "Sign-in" |
| Ads on the death screen | Missing (by decision) | `client/deathscreen.js` has no ad code; DECISIONS:116 "no interrupting ads in the beta". Rewarded ads + Employment Center only on unmerged `origin/ads` (`client/ads.js`, +7 commits; PREBETA-LIST:99) | Pause/death ads deferred; rewarded ads await merge + AdSense approval |
| Donate / tip link | Done | `server/config.js:96` CLA_SUPPORT_URL (Ko-fi default); `client/main.js:2075`; branch `support` merged into main | Founder's Pack (Ko-fi rewards) only on unmerged `origin/founderpack` (+3, held by owner, PREBETA-LIST:101) |

**Summary.** The progression plan is essentially built end to end: careers with enforced unlocks, What's next, goals,
all six contacts with full chains, extraction (gold crates out-earn jobs by 10-20x per half hour), six scheduled
events, district reputation with all four consequences, three money sinks and the beta gift kept through the wipe.
Gaps are small: the weekly crate is paid as cash, Season 1 has no content, the owner-name storefront sign waits on a bake.
In A3 only the admin angel is missing (as expected); ads are deferred by decision (rewarded ads on unmerged `ads`),
the hotel-room instant log-off has no hotel rooms, and server-side age enforcement is off by default.

### A2 The FTUE

| Item | Status | Evidence | What's missing |
|---|---|---|---|
| Arrival by train at a chosen station | Done | `server/systems/firstcar.js:42` arrivalChoices, `:77` arrivalFor; `shared/world3-arrivals.js:36` (city / coast / desert / country); `server/systems/ftue.js:246` arrive; `client/ftue.js:36,148` the card | - |
| One question ("What brings you to town?") | Done | `server/systems/ftue.js:60-65` ANSWERS, `:301` | Small: the hustle's note says "then meet a contact" (`ftue.js:62`), but the goal is the fence or the gang HQ (`ftue.js:158-161`). |
| First goal, at most three steps | Done | `ftue.js:67` STEP_CTL, `:221` `step: [f.step, 3]`, `:184` stepLine | - |
| First car by the answer's path (lot / alley) | Done | `ftue.js:316-322`; `firstcar.js:88` placesFor; a lot and an alley for each station: `shared/world3-firstcars.js:178,184,286,288` | DECISIONS:277 says "Outdoors = a cheap pickup", but outdoors only gets the cash (`rules.js:147`: $450, plus the $200 start, `store.js:25`) and nothing points it to the pickup. Roam marks the used lot, not "the dealer" (`ftue.js:339`). |
| Skippable everywhere, never blocking | Done | `ftue.js:392-419` (skip at every stage), `client/ftue.js:34-35` | - |
| Only new characters, each character once | Done | `ftue.js:97` fresh, `:447` tipsNew; `PROGRESS_EPOCH` (`server/store.js`) | - |
| First-time moments (`MOMENTS`) | Partial | `ftue.js:70-79`: 8 moments (wanted, down, shop, transit, night, hurt, chat, rod); fired at `:481-495`, `players.js:867` | No moment for: the first job or job card, police duty, buying a home, hot money, the first lenient crime warning, swimming or boats, What's next or the phone. Also `rules.js:149` still says "the six". |
| Phone's Guide as the in-game wiki | Done | `shared/guide.js:77` guideSections, `:206` search; `client/guide.js:46` Replay / Show tips; lazy: `client/phone.js:147`, `client/main.js:37` | - |
| Every system, place, job, activity and control has a Guide entry | Partial | 7 sections, about 95 entries (`guide.js:84-200`); 25 place kinds (`guide.js:49-75`) | About 45 things have no entry (list below). 21 of the 40 control actions are never named in the Guide. |
| Guide controls as `[[action]]` | Partial | Uses 19 actions: action, bag, boost, brake, chat, dance, dive, emote, fire, gas, hub, light, map, move, nextw, phone, sprint, use, vehicle | Never named: throw, reload, horn, prevw, wpnwheel, drivefire, cruiser, aim, steer, block, trick, radio, lanes, pads, chord, climb, descend, pause, back, hubtab (`shared/controls.js:44` KB). |

#### Systems/places/jobs/controls with no Guide entry
Not repeated here (already in REPORT.md 2.5): tennis, skateboard, the dock's "Jump in", the casino / cards wording, gang war's biker groups, the station's one line.

**Jobs** (all on the phone's Jobs board: `server/systems/phone.js:206` boardFor):
- Trucker and big rigs: `server/systems/truckjob.js:1`, `rigs.js:1`
- Charter helicopter pilot: `server/systems/charter.js:1` (the Guide's "charter" is the deep-sea one only)
- Search-and-rescue pilot: `server/systems/sar.js:1` (a `sar` place kind too: `client/phone.js:37`)
- Coast guard: `server/systems/coastguard.js:1`
- Crop dusting: `server/systems/dusting.js:1`
- Fishing boat: `server/systems/fishboat.js:1`
- Firewood orders: `server/systems/woodjob.js:1`
- Police on duty, as a job: the cruiser `[[cruiser]]` (`server/systems/cruiser.js:1`), spike strips (`spikes.js:1`), patrol calls. Only "Joining the force" (`guide.js:137`) covers it.
- Posting a bounty (the revenge bounty): `server/systems/bounties.js:1`. Only bounty *hunting* is mentioned.

**Activities and systems:**
- Fighting and weapons, with no entry of their own: melee, blocking, reload, throw, grenades, the weapon wheel, drive-by (`server/systems/combat.js:1`, `grenades.js:1`)
- Flying aircraft and skydiving / the parachute: `server/systems/aircraft.js:1`, `skydive.js:1` (climb / descend controls)
- Hunting, field dressing, the lodge / trapper / butcher: `server/systems/hunting.js:1`
- Foraging (mushrooms, tidepools, finds): `server/systems/foraging.js:1`
- Picking at the orchard, vineyard and lavender: `server/systems/picking.js:1`. "Ranger, the farm" covers only the farm field.
- Felling trees: `server/systems/felling.js:1`
- Gardening at home: `server/systems/gardening.js:1`
- Home upgrades, rooms, the workbench and materials: `server/systems/homeups.js:1`
- Inside your home (bed, shower, stove, decorating): `server/systems/homeinside.js:1`; mail at home: `server/systems/mail.js:1`
- Horses: `server/systems/horses.js:1`
- Campfires, including building one: `server/systems/campfires.js:8`
- Fireworks: `server/systems/fireworks.js:1`
- Feeding the ducks (Samaritan points): `server/systems/ducks.js:1`
- Music: boombox, radio, tapes, instruments, busking, breakdancing (`server/systems/music.js:1`, `shared/music.js:2-3`; controls radio / lanes / pads / chord)
- Lost pets: `server/systems/pets.js:1`
- Surfing, which only gets "beaches have surf": `server/systems/surf.js:1`
- Rollerblades and the surfboard as owned gear: `server/systems/gear.js:1`
- Rides (Ferris wheel, balloon flights, water slides): `server/systems/rides.js:1`
- Hoops, which only appears in the Quit list: `server/systems/hoops.js:1`
- Soccer on the pitch and beach volleyball: `server/systems/minigames.js:1`
- The drive-in, which only appears in the "Games in town" list: `server/systems/drivein.js:1`
- The race book (horse racing), mentioned once: `server/systems/racebook.js:1`
- Working out (push-ups and sit-ups, the gym mini-game): `server/systems/workout.js:1`
- Bathhouse routine, showers, grime and blood: `server/systems/bathhouse.js:1`, `showers.js:1`, `grime.js:1`. The place line only says "Showers, hot baths and a sauna".
- Street happenings (purse snatches, contraband drops, returning a purse): `server/systems/events.js:1`, `happenings.js:1`
- The designed places' small things (mission bells and so on): `server/systems/places.js:1`
- Swimming, sharks and wildlife danger: `server/systems/sharks.js:1`, `wildlife.js:1`. DECISIONS:157 says the Guide carries swimming, but it has no entry.
- Unstuck: `server/systems/unstuck.js:1`
- The pause and back controls, the hub's tabs: `shared/controls.js:44` (pause, back, hubtab)

**Place kinds with no Places line** (the phone's kinds: `client/phone.js:34-39`):
- sports, hardware, coffee, grocery, barber, gas station, snack
- winery, market, fruit stand, farm stand
- roadhouse, clubhouse
- salvage, assay, smuggler
- charter, sar
- ride, race, arena
- the hunting places (lodge, huntcamp, trapper, butcher)
- post office, fire station, taxi rank, impound
- airport, hotel, nightclub
- skatepark, tennis court

### A4 The design document's open rows

| Item | Status | Evidence | What's missing |
|---|---|---|---|
| Road tunnels in World v3 | Done | `shared/world3-roads.js:14,186,225` (highway, arterial and Harbor tunnels); `shared/tunnels.js:77` | - |
| Subway's two-sided stations | Partial | Main line: a footbridge over both platforms, `shared/world3-rail.js` stationFootbridges (DEVLOG:17932). Subway: a platform beside each track, `client/art2/game/tunnel.js:78` | No way between the two subway platforms. |
| Main line at street level in poorer districts | Can't tell | At grade with level crossings: DEVLOG:15034; a tunnel under the core: WORLD-V3.md:1192 | No rule or doc ties it to poorer districts. |
| Crafting tables with a preview (CW1-CW2) | Partial | Home workbench `server/systems/homeups.js:411,466` (HOME_CRAFTS `shared/rules-play.js:86`); the trapper's bench (DEVLOG:3276) | No preview of what you'll make (no outfit on your own character). The bag's crafting section is hidden (`client/bag.js:189`, DEVLOG:17291). |
| Item icons for every material (IC1-IC5) | Partial | `client/bag.js:99` itemGlyph (a line icon per category); `client/inventory.js:13` emoji for some | 125 of 246 items have no icon of their own (meats, hides, pelts, feathers, crafted clothes) and fall back to a category glyph. No pixel icon per material. |
| The gym and its minigame | Partial | `server/systems/workout.js:1` (push-ups and sit-ups anywhere, a pace mini-game); home gym room `shared/homeups.js:46` | No public gym building. |
| The riding skill | Missing | `shared/rules-page.js:31-45` SKILL.act has no riding; DEVLOG:14408 "not yet" | - |
| Tier-4 homes that are businesses | Done | `server/systems/biz.js:1,72-74` (farm, nightclub, hideout, auto shop, food truck) | - |
| Home upgrades | Done | `server/systems/homeups.js:1`, `shared/homeups.js:20,46` | - |
| House-tour exploit | Done (fixed) | `server/systems/homeinside.js:219` (no tour while wanted); `homes.js:508` (no instant log-off on a tour) | - |
| Bathing, toilet, mowing at home | Partial | Shower `homeinside.js:11,289`; hot tub / bath room `homeups.js` | No toilet to use at home (cells only: `shared/cells.js`). No lawn mowing anywhere. |
| Card rooms / poker vs players | Partial | Video poker `server/systems/casino.js:109`; NPC regulars' poker at bar tables (DEVLOG:23868) | No poker table against other players. |
| Cockfights (should NOT exist) | Not present (good) | No code hits; DEVLOG:14864 lists them as the gambling row's unbuilt piece | - |
| Skates, longboards, BMX, skate contests | Partial | Rollerblades `shared/items.js:103`, `server/systems/gear.js:1`; BMX vehicle `shared/vehicles.js:60` | No longboard, no BMX tricks (DEVLOG:3519 "later"), no skate contests. |
| Bathhouses | Done | `server/systems/bathhouse.js:1`, `showers.js:1` | - |
| Censored-nudity setting | Partial | Mosaic `client/art2/people.js:825` (`censored` option, swimwear instead); `client/art2/game/peds.js:105` | Nothing ever sets `censored`: no Settings switch, so the option is never reachable. |
| Fallback art without WebGL2 | Done (by decision: none) | `client/gfx.js:118`; `client/main.js:1546` (reason panel, retry); DECISIONS:169 | `?art=1` still reaches the classic renderer for troubleshooting. |
| In-game map picture for World v3 | Done | `tools/build-worldmap2.mjs` (DEVLOG:24733) | - |
| Crew events | Missing | `server/systems/crews.js:1` quotes the request; only chat, bank and cut are built | - |
| More servers | Missing | DECISIONS:35 ("later several cities") | One city only. |
| Grow rooms | Done | `server/systems/biz.js:15,74,84` (hideout grow lamps) | - |
| Prison yard inmates and the Prison Boat | Partial | Route `shared/world3-ferries.js:31`, skipped `server/systems/ferries.js:384`; release is a teleport `server/systems/prison.js:181-195`; guards `:200` | The Prison Boat doesn't run. No NPC inmates in the prison yard (cells inmates only: `server/systems/cells.js`). |
| NPC farm hands and saved fields | Done | Saved: `server/systems/farming.js:50-68`; NPC tractors `farming.js:96`, `cinefollow.js:333`; hired hands `biz.js:8` | - |
| Lavender picking | Can't tell (likely Missing in v3) | `server/systems/picking.js:43`; the field is laid only by `shared/naturesites.js:380`, which checks the old world's district (`dist === 38`) and gives up | No World v3 lavender field found. Check a built map's `pickables`. |
| Boat hire docks (of 7) | Done (~9 in code) | v3: `world3-marsh.js:160`, `world3-riverrun.js:75`, `world3-water.js:411`, `world3-woodslake.js:187`, `world3-coralcay.js:199`, `world3-gullharbor.js:294`, `world3-pelican.js:7`, `world3-sunsetbeach.js:352`; plus the marina's in `shared/map.js:4622-4630` | Exact count needs a built map. |
| Balloon routes (of 3) | Partial | `shared/rides.js:9,96` (3 ROUTES) | A route is dropped when fewer than 2 of its named places exist (`rides.js:101`). The orchard, vineyard and mission are naturesites pieces that may be absent in v3. |
| NPC chess spots | Done | `server/systems/activities.js:5,149,170`; `world3-midtown.js:922,1217`, `world3-harbor.js:291` | - |
| Ideas list: feeding ducks | Done | `server/systems/ducks.js:1` | No Guide entry. |
| Ideas list: Crazy Taxi | Done | `server/systems/crazytaxi.js:1` | - |
| Ideas list: boombox / radio / tapes | Done | `shared/music.js:2,208`; `server/systems/music.js:1` | No Guide entry. |
| Ideas list: breakdancing | Done | `shared/music.js:3` (the mat, a rhythm game) | No Guide entry. |
| Ideas list: park ranger job | Done | `server/systems/rangerjob.js:1` | - |
| Ideas list: big rigs and trucker | Done | `server/systems/rigs.js:1`, `truckjob.js:1` | No Guide entry. |
| Ideas list: build a campfire | Done | `server/systems/campfires.js:8,141` | No Guide entry. |
| Ideas list: fireworks | Done | `server/systems/fireworks.js:1` | No Guide entry. |
| Ideas list: chess tables | Done | `server/systems/chess.js:1` | - |
| Ideas list: homeless man with a cart | Done | `server/systems/personas.js:201` | - |
| Ideas list: mail delivery job | Done | `server/systems/mailjob.js:1` | - |
| Ideas list: NPC workers | Done | `personas.js`, `activities.js` (DEVLOG:18279) | - |
| Ideas list: instruments | Done | `server/systems/music.js:15` | No Guide entry. |
| Ideas list: forklift job | Done | `server/systems/forklift.js:1` | - |
| Ideas list: fishing boat job | Done | `server/systems/fishboat.js:1` | No Guide entry. |
| Caves with real art and dark parts | Done | `server/systems/underground.js:1`; DECISIONS:234 ("cave art is OK") | - |
| Waterfalls and cliffs by hand | Done | `shared/world3-ledgefalls.js`; `shared/ledges.js` | - |
| Surf waves that curl | Done | `shared/surf.js:13`; `client/art2/game/surfart.js:11,70` | - |
| Big Neon Strip arcade with shared tickets | Done | Flagship arcade, one ticket balance (DEVLOG:16872-16900) | - |
| Sliding doors and shop bells | Done | `client/art2/game/doorart.js:1,17`; `client/sound/places.js:33`, `instruments.js:288` | - |
| Building dressing (graffiti, fire escapes, vines, balconies) | Done | `shared/world3-midtown.js:268,288,289,769`; ivy `client/art2/buildings.js:392` | - |
| All concept outfits in the game | Can't tell | `shared/wardrobe.js:1` cites sheets ST1-ST4, CC1, CC3, CC4, CC7 | No list of concept outfits in docs/ to compare against. |

### A5 The art audit (11-03) top gaps

The audit is the art director's concept audit of 2026-11-03. It has no file of its own. Its gaps are numbered in the DEVLOG:
Wave A1 (DEVLOG.md:19713, signs, gap 14 at night), Waves A2 and D (DEVLOG.md:20402, gaps 3, 6, 7 inside, 11) and the
interiors follow-up (DEVLOG.md:20528). No wave B, C or E entry exists, so the shopfront, roof, bank-outside, Spur, people,
vehicle and plaza gaps had no pass of their own. Some were touched later by the owner's 11-14 and 11-15 passes. World rows
cited below (signCovered, bigEmptyPlaza) are in docs/audit/REPORT.md and not repeated here.

| Gap | Status | Evidence | What's left |
|---|---|---|---|
| 1. Sign lettering off the art grid (`signBoard` sy 3 / sx 1) | Fixed | client/art2/signfont.js (six faces, 7 art px letters); buildings.js:1232-1237 (`signBoard` snaps x/y to even px); statics.js:3003-3009 (roadside boards on signfont, `sx` ignored); test/signs.test.js:51, :82, :129 (glyphs survive the bake, a shopfront sign is whole after the bake, every World v3 sign fits) | Only the old showcase scenes (districts3.js:192, :199, districts4.js:204) still pass `sx: 1`; check they don't use the old font path. buildings.js:210 date stone still uses the old 1 px font |
| 2. Sign faces and colours by trade (not random `SIGNC`) | Partial | Trade table `TRADES` signfont.js:273, `signStyle` :329, statics.js:1061 `styleSign`. `SIGNC` is still live: shared/world3-towers.js:47, :188 (`shopOf` deals the tower podium shops' bg/fg at random). These are `b.art`, so `styleSign(..., hand=true)` (statics.js:1064-1068) keeps the random panel and takes only the trade's face and ink | Tower and podium shops: drop `SIGNC` and let the trade pick the palette. The 72 hand-set `sign: { bg }` in shared/world3-*.js keep their own panels on purpose |
| 3. Floating badge over the sign; no red cross | Partial | Badge moved under the lintel: host.js:403 `badgeAt`, :1028. test/storeicons.test.js:27, :52. The DEVLOG says it is not hidden when the sign's icon tile shows (DEVLOG.md:20420). REPORT.md signCovered still lists badge-over-sign rows (REPORT.md:268-285). Red cross: the world art is clean (storeicons.js:28, buildings.js:1346 `medSign`, props-road.js:96). One is still drawn: **client/deathscreen.js:349-352**, the ambulance marker, a `--danger` (#ff6b5a) cross on a cream disc. The test's source guard (storeicons.test.js:48) misses it because the code is `fillRect`, not `cross =`. tools/build_art.py:650-655 still paints a red-cross roof beacon (legacy v1 art tool) | Change the death screen's ambulance marker (for example to an H or the ambulance glyph). Fix the badge-over-sign rows (REPORT signCovered). Retire or fix build_art.py's beacon |
| 4. Trade shopfronts and window goods (not one rainbow shelf) | Partial | buildings.js:836-926 `storefront` paints about 16 window kinds (bar, liquor, pawn, books, records, laundry, clothes, florist, gallery, salon...). The default branch (buildings.js:921-925) is still the red/yellow/blue/green shelf. statics.js:472-474 `UNIT` / `shopKindOf` send convenience, pharmacy, sports, hardware, grocery, tackle, fishmarket, marina and delivery to `'mart'`, which falls into that default. Clothing and barber go to `'lobby'`, the hotel lobby with chandeliers. The specific kinds are used only by hand-planned districts (world3-arts, midtown, pinkmile, stadium, yards) | Map the generic walk-in trades to their own window kinds (pharmacy, hardware, grocery, sports, tackle, clothing, barber) and paint those that are missing. The shopfront structure itself (frame, riser, mullions every 30 px) is one design for every trade |
| 5. Varied roofs (AC rows on under 40%) | Open | statics.js:657-718 `kitFor`: `L.row('ac', n)` is unconditional for office/glass/hotel (:667), hospital (:673), police/fire (:674), school (:697), civic/bank (:699), nightrow (:703) and the default shops/mixed (:716). Only walk-ups, condos and townhouses use `acs`, and warehouses use vents. The 11-14 passes capped a row at 3 (:608) and added extras to roofs over 150 000 px² (:725-739) | No probability gate: AC rows sit on almost every flat roof. Gate `row('ac')` (for example to 35-40%) and vary the default kit. No roof-variety test or count exists |
| 6. Dressed shop interiors (30%+ floor) | Partial | Wave D added `coverage(R)` (shoprooms.js:251) with a 30% floor in a 10 x 8 room. On 11-06 that test was replaced (DEVLOG.md:20528-20544) by *drawn fill* (`seenOf` :265, fill aims for 36-44%). Test floors are now main's numbers less a point: test/shoprooms.test.js:133-157, :218-220. Boutique 4-11%, sports 4-11%, barber 0-17%, the bars 0-18%, office 0-14%. Only an upper bound of 80% `coverage` is checked (:216) | No test holds 30%. Boutique, sports, barber, bars, office and records sit well under it at real sizes. Raise their FLOOR rows once their plans fill |
| 7. Banks: portico, marble, teller glass, vault | Partial (inside Fixed) | Inside (IN3): DEVLOG.md:20442, test/shoprooms.test.js:227-233 (marble, compass rose, teller glass, the vault door). Outside: statics.js:1332-1344 gives a stone facade (not marble) 2-3 floors high, with a portico (buildings.js:1246) only when the front is 140 px or wider (statics.js:1340). Narrower banks get a door and a plaque | Narrow banks (under 140 px) have no portico. Facades are stone ramps, not marble. Nothing tests a bank's front |
| 8. The Rusty Spur's MC3 look (MC3 = the Spur outside: neon bull skull, porch, burn barrel, the bikes lined up; docs/art-v2/TARGETS.md:35) | Partial / can't tell | All built on 10-08, nothing after the audit: shared/countryside.js:277-306 (skull neon over the door, porch posts, burn barrel, picnic tables, 15 bike slots); buildings.js:1064 skull icon; props-biker.js; statics.js:2499-2500. The front is `shop.kind: 'diner'` (countryside.js:291), so its windows show diner booths and chrome (buildings.js:873-877). The roof kit is plain AC/vents | Give the Spur saloon windows (not the diner kind) and check the MC3 frame in game. The audit's specific complaint isn't recorded in the repo |
| 9. Clinic/hospital fronts lit at night | Partial (likely fixed) | statics.js:1365-1375: the name plaque is lit, a lit EMERGENCY panel, `medSign` glows (buildings.js:1348), a sign light plus a window light. A1: the clinic's lit white face (DEVLOG.md:19746). The town clinic look (statics.js:963) is a wooden gable | The lobby glazing isn't specifically lit. Needs a night look at a hospital and at a town clinic. No test |
| 10. People's proportions and faces | Partial | Faces: 11-14 pass (DEVLOG.md:23301-23327; people.js:1588 `EYE_ST`, :1590 `GLS`, :1816 `face`). Every option reads at street size, NPCs included. Proportions: last changed 10-09 (DEVLOG.md:4592). The 11-14 entry says "nothing restyled". people.js commits since 11-03 are faces, the founder and poses only | Body proportions untouched since the audit. Decide whether the audit's proportion point still stands |
| 11. Distinct bar interiors (lounge, tavern, sports bar, biker saloon) | Fixed | shoprooms.js:21 `BAR_PLANS`, :29 `barPlan`. test/shoprooms.test.js:63, :237-244 (velvet booths, fireplace, long tables, the skull, arm wrestling, pool, MC4's floor). DEVLOG.md:20447-20456 | Their fill is low at small widths (gap 6). Bar *fronts* are one kind, `'bar'` (buildings.js:851) |
| 12. Motorcycles' and cars' finish | Open | client/art2/vehicles.js: since 11-03, only one commit (6f084cdf, rides you carry). No vehicle-art DEVLOG entry after 10-24 (DEVLOG.md:15974) | No pass made. Needs the audit's list and eyes |
| 13. Night signs outside the Strip | Fixed (code) | A1's "gap 14" (DEVLOG.md:19746-19748): every trade-styled sign glows by its lighting mode and throws its colour on the pavement (statics.js:1073-1076, `SIGN_LIGHT` :1058). `nightFront` neon goes on clubs, bars and arcades anywhere (statics.js:1441-1444) | `nightFront` skips `b.art`, pitched, frame and vox fronts (:1444), so hand-planned districts get neon only if their plan sets it. Needs a night drive |
| 14. Plazas with a focal piece and seating | Partial | Hand-placed focal plazas (midtown.js:1490, neon.js:409, fallscenter.js:104-105, northgate.js:130, bayside.js:187). The craft pass of 11-15 (commits 93ce9466, 820ad852, 96532e25, 93bde718). There is no generic plaza dresser | REPORT.md bigEmptyPlaza: 14 empty stretches remain (Downtown 4). Generated plazas get no focal piece or seating rule |

Needs eyes in the game: a night drive through Downtown towers and an ordinary district, looking at the podium shops' colours (gap 2), the generic marts' rainbow windows (gap 4), the AC rows from the air (gap 5) and the sign glow away from the Strip (gap 13).
The Rusty Spur at dusk against the MC3 frame, a narrow bank's front, a hospital and a town clinic at night, and the bars and boutiques at 4-6 tiles wide (gaps 6-9, 11).
The knocked-out screen's ambulance marker (red cross, deathscreen.js:349-352), a walk past three walk-ins with signs to see where the badge lands (gap 3), and a side-by-side of cars, bikes and people against the concepts (gaps 10, 12).

# Part B - the UI audit

### B1 One visual system

What the target is. UI v2 is the 11-12 owner decision: "Direction A, the SNES pad - navy panels, gold rim, CLA Pixel
everywhere in the HUD" (DECISIONS.md:130; DEVLOG 11-12, line ~22859: "CLA Pixel for every word of the in-play HUD
(Barlow Condensed is gone from it)"). Before that, the 10-24 UI-1 overhaul (DEVLOG:16515) set the rule that menus
still follow: "CLA Pixel for titles and numbers and Barlow Condensed for everything you read". That rule is still in
the stylesheet's header comment (`client/style.css:2`) and in `html, body` (`style.css:92`). So every menu is still
in Barlow. That's the "not in the SNES pixel font" the owner disliked on 11-17.

The fonts in `style.css`: `@font-face` for CLA Pixel (lines 8-9) and Barlow Condensed 500/600/700 (5-7). `--pixel` is
`"CLA Pixel", "Barlow Condensed", sans-serif` (67) and `--ui` is `"Barlow Condensed", "Arial Narrow", sans-serif`
(68). `index.html:26` still preloads BarlowCondensed-SemiBold.

**Counts per old style** (client/, all files)

| Old style | Count | Sev | Note |
|---|---|---|---|
| Barlow Condensed via `var(--ui)` | **164** (129 in style.css, 35 in CSS injected from JS) | high | the menus' body font, `html, body` included. `var(--pixel)` has 179 uses (136 css) |
| Barlow Condensed as the only face in canvas text | 17 lines | med | listed below |
| Barlow as the fallback after CLA Pixel (`"CLA Pixel", "Barlow Condensed", …`) | ~45 lines | low | fine while CLA Pixel loads. It only shows before the font arrives |
| Canvas `sans-serif` with no CLA Pixel | 29 lines | med | bowling, trains, boards, tunnels, vault, music |
| `monospace` | 34 in 32 lines (30 primary, 2 fallback) | med | car soccer is in REPORT 2.1. The rest is listed below |
| `serif` (a real CSS face) | 3 (`cinema.js`) | low | the 15 `'serif'` hits in `art2/signfont.js` / `buildings.js` / `statics.js` are the pixel sign font's own "Serif Caps" face, so not a problem |
| `system-ui` | 1 (`account.js:66`) | high | the consent gate and Account overlay |
| Roboto/Arial | 1 (`account.js:359`) | low | the Google button. Google's brand rules ask for it |
| GTA v1 `--accent` / `--accent2` tokens | 0 | - | removed on 10-24 |
| `#ff3e8a` (GTA pink) | 1 (`spectator.js:257`) | low | your own dot on the spectator map |
| `#7a3cff` (GTA purple) | 0 | - | |
| Anton | 0 | - | Anton-Regular.woff was removed (DEVLOG:16567) |
| Rubik | 0 | - | no `@font-face` and no mentions. Nothing falls back to Arial |
| Inline-styled panels (`style="…"` in HTML strings) | 90 in 54 lines; 76 of them in `account.js` | high (account) / low (rest) | the rest set swatch colours, positions or bar widths from data, which is fine |
| `style.cssText` | 10 | low | 2 build panels (`creator.js:176`, `perfhud.js:62`). The others place canvases |
| `.style.background*` / `.style.color` | 4 | low | `director.js:672` gives a tip the literal gold `#ffd23a`. `inventory.js:177` draws a vignette |

**By screen / feature**

| Screen / feature | Where | Old style | Sev |
|---|---|---|---|
| Consent gate ("Before you play") and the Account / sign-in panel | `client/account.js:66-69` (`css`, `box`, `btn`, `btn2`), `129-135`, `357-406`, `483` | the whole panel is built from inline styles: `system-ui` 15px, grey `#1b1e24` box, `#333` border, blue `#3a7bd5` / grey `#444` buttons, radius 6/10px, text `#9aa0aa`, `#ff8a80`, `#ffd27f`. It's the old "app" look. In the title slot, `style.css:1928-1939` (`#gate-body`, `#signin-body`, with `!important`) repaints it in Barlow. The full-screen overlay (`showGate` without `into`, the Account panel at `:483`) shows it raw | high |
| Shared parts every menu uses | `style.css:92` (`html, body`), `101` (button/input/select), `114/118` (.row/.opt), `124` (.btn/.sbtn), `144` (.ibtn), `152` (.chip), `176` (.tab), `180` (.seg), `184` (.field), `191` (.drop) | `var(--ui)` (Barlow), 11. This is the root of it: anything without its own font is Barlow | high |
| In-play HUD (should be all pixel, per the 11-12 decision) | `style.css:583-584` (.bigkey key/pad hint), `621` (#edgewarn small), `649` (#exithint), `744` (#wpick .wp-w weapon picker) | `var(--ui)`, 5. These go against the decision | high |
| HUD canvas: ride / skate score cards | `ridehud.js:14, 39`; `skate.js:132, 137, 142, 145` | Barlow-only canvas font (the titles above them are CLA Pixel) | med |
| Knocked-out screen | `deathscreen.js:332, 354` (canvas "You fell here", place names); its injected CSS `:64, 68, 78, 81, 86, 93, 107` | Barlow canvas font; `var(--ui)` ×7 | med |
| Fishing catch card | `fishing.js:275, 278, 279` | Barlow for the stars, worth and log lines | med |
| Shop / counter menu (#menu) | `style.css:762, 764, 772, 785, 796, 818` | `var(--ui)` ×6 | med |
| Phone (hub) and its apps | `style.css:1018, 1021, 1027, 1042, 1592, 1605, 1609, 1618, 1630, 1632, 1638, 1642, 1685` | `var(--ui)` ×13 | med |
| Job card / race card | `style.css:1672-1716` (.jc-*, .rc-*) | `var(--ui)` ×13 | med |
| Bag | `style.css:1728-1788` (.bag-*, .bd-*) | `var(--ui)` ×13 | med |
| Big map screen | `style.css:1105-1138, 1566, 1574` (.bm-*, .lg, #bm-tp, #bigmap-hint) | `var(--ui)` ×11 | med |
| Character creator | `style.css:1269-1346` (.cc-*); `creator.js:53, 58, 61` | `var(--ui)` ×11 + 3 | med |
| Title screen | `style.css:908, 915, 929, 945, 972, 975, 978, 980, 995, 998` (#t-status, #t-tip, #t-off, #veil, #t-gfxseg, #t-gfx, .t-who, #t-online) | `var(--ui)` ×10 | med |
| Settings | `style.css:845-846, 1844, 1847, 1848, 1857, 1861` | `var(--ui)` ×7 | med |
| What's next / goals card | `whatsnext.js:19, 34, 38, 46, 54` (injected CSS) | `var(--ui)` ×5; radius `var(--r2)` (rounded, not the square UI v2 plate) | med |
| FTUE arrival station pick | `style.css:1216, 1219, 1220, 1232` (.arr-*, .ap-opt) | `var(--ui)` ×4. It's the first menu a new player sees | med |
| First-time moment / jail / interior door / update note / art error | `style.css:1157, 1174, 1181, 1184, 1190` | `var(--ui)` ×5 (the "small" sub-lines) | med |
| Guide | `style.css:1654-1655` (.gd-e b/p) | `var(--ui)` ×2 | med |
| Bug report | `style.css:1955-1965` (.br-*) | `var(--ui)` ×5 | low |
| Players online, install help, people, wheels, .fl, .pz | `style.css:865, 868, 874, 1824, 1076, 1083, 1071, 1490` | `var(--ui)` ×8 | low |
| Chat | `chat.js:130, 132` (injected) | `var(--ui)` ×2 | med |
| Spectator view | `spectator.js:193, 222, 232, 253` (canvas), `:23, 26, 30` (CSS), `:257` (`#ff3e8a`) | Barlow canvas ×4, `var(--ui)` ×3, GTA pink ×1 | low (staff) |
| Dev / admin panels, debug homes / teleport maps, cinematic director | `devmenu.js` ×7, `adminpanel.js` ×6, `director.js:277, 279`; `devhomes.js:60`, `devtp.js:72`; `perfhud.js:62` (cssText, monospace) | `var(--ui)`, Barlow canvas, an inline monospace panel | low (staff/debug) |
| Bowling scoreboard and strike text | `bowling.js:64, 74, 75, 110, 116, 121, 123, 125` | canvas `sans-serif` (falls back to Arial/Helvetica) ×8 | med |
| Music: arcade rhythm/jam games; gig labels in the world | `music/play.js:166` (`txt()`, every word of the games); `music/stage.js:128` | `monospace`; `sans-serif` | med |
| Vault heist, tunnels | `vault.js:58`, `tunnels.js:166` | canvas `sans-serif` | low |
| Drive-in screen ads | `cinema.js:76, 87, 89` | `serif` | low (it's content on a screen) |
| World labels in the v1 / overlay renderer | `render/buildings.js:401, 410`, `render/country.js:129, 201, 202` (DCO, STARLITE DRIVE-IN), `render/homeview.js:459-460` (door numbers), `render/newprops.js:105, 107`, `render/sprites.js:210`, `render/tiles.js:354, 778` (runway 36/18), `render/tunnelplat.js:54`, `underground/view.js:247` (METRO), `render/traincars.js:90`, `render/trains.js:139, 196, 220, 261, 306, 308` | `monospace` / `sans-serif` | low (the art v2 signs use `art2/signfont.js`) |
| Car soccer HUD, station / bus boards, subway queue | `carsoccer.js` ×11, `render/trains.js:291, 392-393`, `busboard.js:28-32`, `trainsign.js:21, 29-30` | monospace / sans-serif. **Already in REPORT 2.1**, not repeated here | (see 2.1) |

### B2 Tokens

**style.css is fully tokenised. The token set itself is what needs work.**

| Measure | style.css | client/*.js (top level) |
|---|---|---|
| Colour literals (hex / rgb / rgba) | 112. All but one are in the `:root` block (lines 14-84). The one outside, `#364` at 1342, is a task number in a comment | **1731**, 979 distinct |
| `var(--…)` uses | **2997** | (the injected CSS uses tokens; canvas code can't) |
| Distinct colour values | 105 (all `:root` tokens) | 979 |
| Golds / yellows (solid, not cream) | 9 tokens: `--gold #e2bd57`, `--gold-hi #f4d98a`, `--gold-d #a8862e`, `--pad-gold #f6c945` (= `--pad-act`), `--act-disc #e2b33c`, `--act-hi #f0c55a`, `--pad-st #e8b21a`, `--pad-y #e8b022` (+ 2 alpha: `--gold-a`, `--gold-t`) | ~40 solid golds. The most used are `#ffd34a` ×35, `#ffd23a` ×32, `#f2c21b` ×16, `#c8a050` ×14, `#ffd400` ×6, `#ffd24a` ×4, `#ffd27f` ×4, `#ffd25a` ×3. **None is a token value** |
| Creams | 4: `--cream #f3ead2`, `--pad-cream #f4ecd8`, `--rail-a #efe6cf`, `--card #fbfaf4` | `#f4f2ea` ×17, `#e8e2d0` ×7, … |
| Reds | 8: `--danger #ff6b5a`, `--danger-hi #ff9585`, `--pad-fire` = `--pad-hp #e8434b`, `--pad-b #d8353b`, `--fire-disc #c8463c`, `--fire-hi #e0594d`, `--card-red #c0262d`, `--red-d #8f2a22` | 100 distinct. `#c8262b` ×19, `#ff3b3b` ×6, `#ff5a5a` ×4, `#ff8a80` ×3 |
| Money greens | **2**: `--money #6cd06c` and `--pad-cash #3ccf6e` (= `--pad-car`); + `--money-hi`, `--money-t` | `#3ddc84` ×9, `#7fe07f` ×8, `#7dff7a` ×5, `#7dffa0` ×5, `#3ddc5a` ×2, `#8aff6a` ×2 |
| Navies / inks | `--navy #0f1830` vs `--pad-navy #141a33` vs `--sky-base #0e1631`; `--ink #070b16` vs `--pad-ink #0b1020`; `--panel-bg` gradient `#15223f`/`#0d162d` | `#05060c` ×7, `#0b1020` ×3, `#0b1830` ×2, … |
| Font sizes | 13 distinct expressions, all on the scale `--fs-1..6` (12/14/16/20/28/40) + `--fs-w1/w2` + `--fs-row`; one literal, `.62em` ×2 | CSS strings: 7 literal px sizes (13px ×5, 12, 14, 15, 16, 18, 10), mostly in `account.js` / `perfhud.js`. Canvas: 124 `font =` assignments, each a hand-typed px string. Only `worldmap.js:16` shares a font constant |
| Border radii | 8 expressions, all tokens (`--r1` 4, `--r2` 10, `--r3` pill, `--r4` 28) or `0` | 9: tokens + literal `6px` ×4, `10px` ×2, `8px`, `4px`, `3px` |

**The 10 worst offenders**

| # | What | Where | Sev |
|---|---|---|---|
| 1 | **Two palettes side by side.** UI-1's `--navy/--gold/--cream/--ink/--money/--info` (10-24) and UI v2's `--pad-navy/--pad-gold/--pad-cream/--pad-ink/--pad-cash/--pad-roll` (11-12) are near twins: `#0f1830`/`#141a33`, `#e2bd57`/`#f6c945`, `#f3ead2`/`#f4ecd8`, `#070b16`/`#0b1020`, `#6cd06c`/`#3ccf6e`, `#5ab0ff`/`#4aa8ff`. HUD plates and menus come out in slightly different navy and gold | `style.css:14-15` vs `39-45` | high |
| 2 | **Golds**: 9 gold/yellow tokens (a tenth is an alias) and ~40 more in JS, none on a token. `#ffd34a` ×35 and `#ffd23a` ×32 are the de-facto canvas gold. `#e2b33c` vs `#e2bd57`, `#e8b21a` vs `#e8b022`, `#f6c945` vs `#f0c55a` are near-identical | `style.css:15, 25, 35, 39, 43, 60, 62`; JS in 41 files (119 hits of the top three) | high |
| 3 | **Money green**: two token greens (`--money`, `--pad-cash`) and six more in JS (`#3ddc84`, `#7fe07f`, `#7dff7a`, `#7dffa0`, `#3ddc5a`, `#8aff6a`). One meaning, eight colours | `style.css:15, 43`; `main.js`, `bowling.js:116`, `hud.js`, `fishing.js` | high |
| 4 | `account.js`: 42 literals + 76 inline `style=""`, its own grey/blue palette, radii 6/10px, `system-ui` | `client/account.js:66-69, 357-406` | high |
| 5 | **Reds**: 8 token reds, 4 of them for fire/danger (`#ff6b5a`, `#e8434b`, `#d8353b`, `#c8463c`), + `#c8262b` ×19 and 99 more in JS | `style.css:15, 25, 28, 35, 40, 43, 60, 61` | med |
| 6 | `main.js`: 402 literals, the most of any file. Most draw the world overlay, but UI text colours are typed in too: `#ffd400` (4087), `#ff4fd8` (4265), `#eafff1` (5093), `#ff9a3a`/`#ffd36b` (5310), `#1b2333` (4617). Plus 16 canvas fonts typed by hand | `client/main.js` | med |
| 7 | `hud.js` 102 and `worldmap.js` 93: the minimap and the map screen keep their own colours for the same meanings (waypoint gold, police blue, danger red) that the CSS tokens name | `client/hud.js`, `client/worldmap.js` | med |
| 8 | **Two shapes**: UI v2 plates are square (`border-radius: 0` ×26 + `--pn-rim`), while the menus are rounded (`var(--r2)` ×72, `var(--r1)` ×42, pill ×29, and `var(--r2)` ×24 in injected CSS) | `style.css` throughout, `whatsnext.js`, `deathscreen.js`, `devmenu.js` | med |
| 9 | Canvas fonts: 124 font strings typed by hand, at about 20 px sizes and 3 weights, with no shared constant (only `worldmap.js:16 PIXEL`). That's how the Barlow-only and sans-serif cases above slipped in | 35 files, `main.js` ×16, `carsoccer.js` ×11, `trains.js` ×9, `bowling.js` ×8, `homeview.js` ×8 | med |
| 10 | Tokens defined but only partly used: `--ui` (Barlow) is the default font, so the UI v2 font has to be opted into one selector at a time. `--act-disc`/`--act-hi`/`--fire-disc`/`--fire-hi` duplicate `--pad-act`/`--pad-fire`, and `--disc` is `--pad-navy` at 55% | `style.css:35, 40-41, 68, 92` | low |

Also: `fishart.js` (174 literals), `interiors.js` (85), `pool.js` / `cinema.js` (47 each) are mostly sprite/art palettes, which is acceptable for art. `spectator.js` (53) and `carsoccer.js` (45) are staff / placeholder overlays (REPORT 2.1).


The "10-24 UI review" is not in the repo as its own file: its findings survive as the nine quick fixes of
`docs/DEVLOG.md:16127` ("ui0: the UI review's quick fixes (P0)"); the redesign phases ui1-ui4 follow it
(DEVLOG:16515, 16597, 17212, 17367). Items from that list are marked **[10-24: Fixed / Open / Partly]**; everything
else is new. Geometry was computed from `client/touchslots.js` `slotGeometry` (run in node) and the CSS - not from
screenshots. Nothing here repeats `docs/audit/REPORT.md` or the known items of `docs/audit/PREBETA-LIST.md`.

### B3 Touch

The touch cluster at 390x844 (iPhone insets t47 / b34), from `slotGeometry`: aim stick x262-378 y672-788; FIRE
196-260 / 660-724; FIRE ON (u4) 208-256 / 746-794; ROLL 226-278 / 598-650; ACT 292-356 / 580-644; C1 202-250 /
542-590; C2 268-316 / 522-570; vehicle 330-382 / 520-572; weapon card 262-326 / 464-512; switches up to y 408. The move
stick (`#stick-l`) x20-144 y682-806.

- **[10-24: Fixed]** CLIMB / DOWN off the move stick: in the air they take C2 / C1, right of the middle upright
  (`shared/touchcontrols.js:30`, `client/touchslots.js:34`); labelled CLIMB / DOWN (`index.html:105-106`).
- **[10-24: Fixed]** HORN out of the left thumb zone: it is C1 at the wheel (`shared/touchcontrols.js:28`), x202-250
  upright, inside the right half.
- **[10-24: Partly] med** - `client/touchslots.js:34` (u4: [158, 40, 48]): FIRE ON is off the aim stick's ring but
  upright it sits only ~14 px from the stick's edge (centre distance 97 px vs radii 58 + 24; ~14 px at 360x740 too) -
  the same "thumb on the stick's edge flips it" risk the owner reported, just smaller.
- **[10-24: Fixed]** 44 px targets: the slots have floors of 48 / 44 (`client/touchslots.js:37-38`); the panels'
  close, selects, creator chips / swatches, map checks, bag pins get 44 on touch (`client/style.css:1891-1902`). The
  generic `.touch :is(.x, #m-close, #s-close)` rule has id specificity, so module-level `.x` sizes (chat, emotes, cine
  panel) are lifted to 44 too.
- **New, still under 44 px on touch:**
  - med - `client/chat.js:101`: the quick-line chips `.cht-chip` are 34 px tall (no touch override); `:76` the chat
    tabs 36 px; `:141`, `:149`, `:155` the mute / request / undo buttons 36 px.
  - med - `client/emotes.js:126`: the emote picker's tabs `.emo-tab` 36 px.
  - med - `client/whatsnext.js:40`: the What's next card's skip button 30x30 (class `skip`, not `.x`, so no lift);
    `:46` and `:54` the goal / season buttons 32 px (only `.go` gets 44: `:39`).
  - low - `client/style.css:1865`: on a screen under 560 px tall (every phone on its side) the Settings tabs drop to
    `min-height: 40px`.
- **New: buttons overlapping each other:**
  - high - `client/style.css:383-385` vs `client/touchslots.js:34`: at 360x740 upright (common Android size, not in
    `test/hudlayout.test.js`'s screen list) the emote button (x148-192, y636-680) runs into FIRE's disc (centre 210,631
    r 29: 19 px from the button's corner) and the chat button (x148-192, y688-732) touches FIRE ON (x192) with 0 px gap.
    At 390x844 the emote button is 4 px from FIRE (the slots keep 6 px between themselves). Both buttons are placed by
    fixed CSS offsets, not by `slotGeometry`, so the cluster's scaling never moves them.
  - low - `client/style.css:379,385` vs `:656-657`: upright the chat / emote buttons (x148-192) start inside the move
    stick's touch zone (`#zone-l` is the left 40% = 0-156 px).
- **New: safe areas** - **[10-24: Fixed]** for the slots (`client/touchslots.js:48`), the move stick, chat / emote
  buttons, the shop menu, the weapon picker, the death panel, the cinematic shutter. Exception: low -
  `client/style.css:1202`: the arcade's ✕ sits at `right: -18px` of a frame that is 92vw + padding wide; upright on a
  390 px phone the frame reaches x≈387 and the ✕ ends near x≈405 - about 14 px of it off-screen, with no inset.
- **New: the top-centre / play area upright:**
  - med - `client/touchslots.js:34-35`: upright the right-hand cluster now reaches y 408 of 844 (the switches u1/u2;
    the weapon card at 464) - the ui0 fix had kept it under y 548. The right half of the lower 52% of the screen is
    buttons; the player (screen centre, y≈422) stands level with the top of it.
  - low - `client/touchslots.js:84-85` / `client/style.css:503`: upright the prompt card's foot is set 10 px above the
    highest left-of-column button (C1, y542), so the card sits at y≈450-532 across x16-254 - directly under the player
    in the middle of the view.
  - low - `client/chat.js:63`: upright the chat feed's last line is fixed at `top: st + 236px`, full width; the job
    card / toasts row (`#hud-tc`, `client/style.css:230,288-290`) is in the same band - may overlap (needs eyes).
  - low - `client/director.js:260`: the cinematic ✕ is top-centre on every device (intended, noted).

### B4 Wording and hints

- **[10-24: Fixed]** "TAB to switch" / "tap: next · hold: pick" gone from the HUD (`client/hud.js:319`); the arcade's
  hint is per device ("Tap ✕ to leave", `client/main.js:529`) - but low - `index.html:122` still ships "Esc / B to
  leave the cabinet" as the default text before the first credit sets it.
- **[10-24: Fixed]** the prompt's leading colon: `client/glyphs.js:43-49` strips `KEY:` and shows the glyph.
- **[10-24: Fixed]** "SAM" jargon: written out as Samaritan everywhere shown (`client/hudinfo.js:50`,
  `client/phone.js:167`, `client/titlescreen.js:161`). low - the weapon "SAM Launcher" (`shared/items.js:64`) keeps the
  acronym. No "EXP" found ("Criminal XP").
- **[10-24: Fixed]** settings rows by device: Controls shows only the chosen device's binds and options
  (`client/hub.js:43-49`, `data-for` in `index.html:218-222`). low - `index.html:239` "Fullscreen when playing on a
  phone" shows on desktop too; Fullscreen is offered three times (Graphics `index.html:241`, Help `:269`, title `:149`).
- **[10-24: Fixed]** `#net` (fps line) hidden from players (`client/style.css:594-595`). low - it can never show now:
  its rule waits for `#b-dev.on`, and nothing ever sets that class (only `client/main.js:2381` touches `#b-dev`).
- **[10-24: Partly] med** - "Debug menu" left the pause list, but every player still sees debug entry points:
  `index.html:47` the 🐞 button on the HUD (36 px desktop, 44 touch, beside the minimap upright: `client/style.css:
  255-260`) has no rule hiding it outside Dev Debug Mode - ui0 said it leaves the row until Dev Debug Mode is on; and
  `index.html:278` "Debug menu" in Settings > Help is `play-only`, not dev-gated (`client/hub.js:72-73`; only "Leave Dev
  Debug Mode" is). A tap sends `devmode` with an empty password (`client/main.js:1601`) and gets a refusal.
- **New: keyboard words on touch:**
  - med - `server/systems/revive.js:230`: the prompt "Hold to revive X · hold F to finish them" - `formatPrompt` only
    converts a leading `KEY:`, and `localizeText` only "press X" (`client/glyphs.js:52-55`), so touch and pad players
    read "hold F".
  - med - `client/director.js:359`: the follow-scenes tour toast "N skips, Esc ends it." on every device; `:470` "drag
    or WASD / the stick ... Esc for your character"; `:712`, `:737` the cinematic panel's tips are keyboard / pad key
    lists (Q / E, Shift, Space, F2 / F4 / F8 in button labels at `:740`) - the panel is player-facing (Settings > Help >
    Cinematic mode).
  - low - `server/systems/skate.js:96,99`: the board's first lines list all three devices' keys at once ("Space / A /
    OLLIE", "click / RT / TRICK").
  - low - `shared/controls.js:36`: Settings > Controls > Touch says "Change tab: TAP A TAB", but the hub has no tab
    strip on any device (keyboard Tab and pad bumpers step through it: `client/main.js:1737`).
- **New: the same screen under several names:**
  - med - `client/creator.js:555`: the starting looks say "You can change everything later from the menu
    (Appearance)" - no screen or row is called Appearance; the way is MENU > SETTINGS > ACCOUNT > "Change how you look"
    (`index.html:250`) or the title's CHARACTER.
  - low - the bag's touch button is ITEMS (`shared/touchcontrols.js:16`, `shared/controls.js:40`) while the screen,
    the pause row and the Guide call it BAG.
  - low - the phone opens with the head "HOME" (`client/main.js:2173`; `client/phone.js:75` "Home") although the HUD
    button, pause row and Guide say PHONE.
  - low - the pause screen: HUD button "MENU" (`index.html:58`), its head "PAUSED" (`index.html:180`), Settings >
    Controls "Open the menu" (`client/hub.js:15`). Consistent enough; no "Options" / "SYS" left.
- **New: controls with no on-screen hint** (`client/hudinfo.js:116-124`, the first-time strips):
  - **[10-24: Fixed]** aircraft climb / descend (`air` strip), handbrake (`drive`: dive = handbrake), horn, sprint
    (keyboard `foot`), gallop.
  - low - `client/hudinfo.js:118,121`: the pad's drive and boat strips drop the handbrake (A) and horn (D↑).
  - low - block (RMB / LT), reload, throw, the weapon wheel (1-9 / hold RB), flashlight (L), call a cruiser (V),
    dance (G), bag (I) have no strip or HUD chip on keyboard / pad - the Guide and Settings > Controls only. (The
    HUD's round buttons carry P / M / T / B / ESC chips.)
  - low - `client/hudinfo.js:123`: the cinematic strip on touch says "MENU - leave the cinematic mode", but the way
    out on touch is the top-centre ✕ (`client/director.js:260`).

### B5 Screens

- **Phone** - Fixed: a 4-column icon grid (`client/style.css:1591`, `client/phone.js:127`) and the open app's name in
  the hub head (`client/main.js:2047`). low - 16 apps with the Guide last (`client/phone.js:69`): the in-game wiki is at
  the bottom of the grid. low - the head says HOME at home (see B4).
- **Bag / inventory** - Open, med: desktop has no HUD button for it - only the I key (shown as a chip in the pause list,
  `index.html:185`) and MENU > BAG; on touch the only HUD way in is ITEMS (`shared/touchcontrols.js:16`), which shows
  only while you hold an item (`need: 'items'`, `client/touchslots.js:179`) - with an empty bag there is no bag button
  at all, only MENU > BAG. The Guide's line (`shared/guide.js:192`) is the only teaching. Known: the `inventory` branch
  (PREBETA-LIST:89, :98) is unmerged.
- **Quick wheel** - low - `client/style.css:1076-1081`: four 112 px slots at ±128 px (±134 lit, scaled 1.08); on a
  360 px upright phone the side slots run 4-14 px off the screen (no portrait rule; only a short-screen one at
  `:1084`). Tapping off the slots closes it (`client/main.js:1842`) - nothing on screen says so.
- **Weapon picker** - Fixed: it has a 44 px ✕ (`client/inventory.js:94`, `client/style.css:741`) and insets
  (`:738`).
- **Pause menu** - **[10-24: Fixed]** RESUME is first (`index.html:182`); Debug menu is gone from it. Fits 390 px tall:
  under 520 px tall the list goes to two columns of 44 px rows (`client/style.css:1505-1514`) - about 340 px with the
  head. Upright it sits at the foot in thumb reach (`:1503`).
- **Settings** - Fixed: 8 tabs scrolling sideways (`client/style.css:1832-1834`), Controls filtered by device with the
  others one tab away (`client/hub.js:43-49`). low - tabs 40 px on short screens (`:1865`); med - the Debug menu row
  for every player (`index.html:278`); low - LEGAL's Terms / Privacy are disabled "draft" rows (`index.html:284-285`).
- **Shop panel over the minimap** - docked at the foot at most 60vh tall (`client/style.css:752-753`), clear of the
  minimap on desktop and upright. low - on a phone on its side it takes the full height
  (`client/style.css:1863-1866`), the minimap and the vitals hidden behind it while the city runs on.
- **Death screen** - Fixed: the cause shows on every device (`client/deathscreen.js:78,153`); the hide control has no
  key chip on touch (`:156-157`); the spawn map's clicks on desktop fixed 11-17 (PREBETA-LIST:313-317). Upright the
  map is the top 38% (`:113`).
- **Cinematic panel on phones** - **[10-24: Partly] med** - `client/director.js:271`: on touch the panel is
  `min(290px, 100vw - 92px)` wide and the full height - upright that is 290 of 390 px, the whole left three-quarters of
  the screen; its tips are keyboard words (B4). The drift / follow bar keeps to the right half (`:289`) - fixed.
- **Character creator, saved looks** - Open (known: PREBETA-LIST:78-83): the footer's "Add to Saved" and the Saved
  tab are still there (`client/creator.js:445,469`), and the Done toast still points at "Add to Saved"
  (`client/creator.js:210`).
- **Starting looks upright** - Fixed: two to a row, scrolling, at most 56vh (`client/creator.js:82-86`), with "Play
  as" / "Customize this character" under it (`:559`). med - the "(Appearance)" wording (B4, `client/creator.js:555`).
- **Arcade cabinet** - low - the ✕ partly off-screen upright (B3, `client/style.css:1202`).
- **What's next card** - med - its skip / goal buttons under 44 px on touch (B3, `client/whatsnext.js:40,46,54`).

### B6 Screenshots (1440x900, 844x390, 390x844)

**How.** No Playwright on this machine; the shots were taken with the installed Chrome, headless, driven over the DevTools
protocol from a throwaway script (outside the repo), against `CLA_WORLD=v3` on `127.0.0.1:8091` (World v3 up in 91 s,
2.4 GB). The touch sizes used touch emulation and an iPhone user agent. One guest went through the whole run, so each
size shows the FTUE's next step. The phone and the pause menu couldn't be opened reliably from the script (a synthetic
Esc switched the HUD to keyboard chips), so those screens were judged from code (B5). **Windows note:** the game server
serves no page files on Windows: `normalize()` turns `/client/style.css` into `client\style.css`, which fails the
`client/` prefix check (`server/index.js:120-122`), so every file is a 404. Production runs on Linux, so this only
matters for local testing; the shots went through a small local front that served the files and passed everything else
to the game.

Kept in `docs/audit/shots/`:

| Shot | Screen | What it shows | Sev |
|---|---|---|---|
| `1440-ftue-where-to.png` | FTUE "Where to?" (desktop) | the sign "SANDPIPER / JUNCTION FIRST" broken onto two lines and clipped at the bottom; the letterbox bars slice the minimap and the round HUD buttons; the 🐞 debug button under the clock; "Where to?" in a pixel title but Barlow body | high |
| `1440-starting-look.png` | Starting looks (desktop) | "change everything later from the menu (Appearance)" - no such screen; the browser's white scrollbar under the carousel; body text in Barlow | med |
| `844-age-gate.png` | Before you play (phone on its side) | the gate is taller than the screen: its title is cut off at the top; the panel's body in Barlow | high |
| `844-title.png` | Title (phone on its side) | no SIGN IN button and no Samaritan line (the 844x390 button list has every other title button) | med |
| `844-settings.png` | Settings (phone on its side) | two rows of tabs take half the height, about 190 px left for the rows; "Detected an Xbox" and A SELECT / B BACK on a touch Windows device (`client/platform.js:17`) | med |
| `844-first-question.png` | "What brings you to town?" (phone on its side) | readable, fits; covers the lower two-thirds while the city runs on (fine for a question) | ok |
| `390-hud-upright.png` | In play (upright) | the 🐞 button beside the minimap; ITEMS on the right edge mid-screen; buttons from y≈440 down; emote/chat stacked inside the move stick's zone; a "$640" price tag plate on the overlay | med |
| `390-pause.png` | Pause (upright, after a keyboard Esc) | fits the screen; RESUME first; LOG OFF shows "safe: stand still 10 s" | ok |
| `390-creator.png` | Character creator (upright) | fits; "Add to Saved" and the Saved tab still there (known, PREBETA-LIST) | low |

By screen, from the shots:
- **Title:** sideways phone loses SIGN IN (med). Desktop and upright fine.
- **Age / consent gate:** clipped on a sideways phone (high); old styling under the repaint (B1).
- **Starting looks:** wrong wording, native scrollbar (med).
- **FTUE arrival:** broken sign (high), HUD cut by the bars (med), the debug button (med).
- **HUD in play:** the debug button on every size (med); upright density (B3).
- **Settings:** half the height is tabs on a sideways phone (low); Windows touch -> Xbox (med, needs a real tablet).

