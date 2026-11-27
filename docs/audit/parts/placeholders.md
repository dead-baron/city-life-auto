## 2. Placeholder and unfinished scan (client/ and shared/)

Severity is how visible it is to players. The old v1 renderer (`drawWorldV1`, `client/render/chars.js`) only runs with art v2 off,
so its stand-ins are low.

### 2.1 Plain shapes standing in for game art (drawn on the overlay over art v2)
| Where | What | Sev |
|---|---|---|
| `client/carsoccer.js:141-158` | car soccer ball: radial-gradient circle + ellipse "panels" + arc highlight, not pixel art | high |
| `client/carsoccer.js:86-101` | goals: translucent team fill, line-grid net, round-capped strokes for posts | high |
| `client/carsoccer.js:102-113` | boost pads: pulsing translucent ellipses with a stroked ring | high |
| `client/carsoccer.js:116-138` | join pad: dashed ellipse + a floating dark rgba box "CAR SOCCER / JOIN HERE" in monospace (a web-style box) | high |
| `client/carsoccer.js:181-214` | scoreboard, GOAL! / FULL TIME banners, boost ring, key hint: flat fillRects + monospace | med |
| `client/carsoccer.js:159-178` | `replay()` dead code (the replay was removed 11-17); the server still records and sends it (`server/systems/carsoccer.js:217,334`) and `test/carsoccer.test.js:114,146` still asserts it | low |
| `client/render/trains.js:335-367` | the boarding cue: pulsing green strokeRect boxes round the subway queue lane and stairwell, a green platform-edge line, vector chevrons | high |
| `client/render/trains.js:371-394`, `client/render/busboard.js:28-32` | station "NEXT TRAIN" board and bus-stop board: flat fillRect plates, 3-5 px sans-serif/monospace text (the "glitched tiny" bus signs); `client/main.js:3801` calls them "interim, flat on the overlay" | med |
| `client/render/trains.js:277-292` | subway queue lane: translucent fill, yellow dashed rect, footprint rects, sans-serif "WAIT HERE" | med |
| `client/main.js:1156-1160`, `3097-3107` (reused `4564`) | the skateboard "thrown board" on every bail: a hand-filled 22x8 canvas (pale wheels, teal deck) - the owner's stand-in; also used for a board lying on the ground | med |
| `client/main.js:5203-5230` | job truck / starter car: two marching dashed ellipses, a navy "YOUR TRUCK" plate, and a vector arrow at the screen edge (the 11-17 no-off-screen-arrow rule was for events; same spirit) | high |
| `client/main.js:5233-5247` | floating "YOUR CAR" plate | med |
| `client/main.js:5072-5098` | ATM markers: floating green circle with "$", a gradient beam when it's the waypoint, a translucent halo | high |
| `client/main.js:2981-2991` | lost pet "Lost my dog!" speech plate with a paw made of ellipses | med |
| `client/main.js:5334-5344` | waypoint (vector diamond) and job marker (yellow vector triangle) | med |
| `client/main.js:5326-5331` | rumor area: dashed translucent circle | med |
| `client/main.js:1543`, `3953-3957` | valuable crates: pulsing stroked ring | med |
| `client/main.js:1534-1541` | vehicle for-sale price tag: cream fillRect with a red stroked box | med |
| `client/main.js:3021-3039` | police suspect marks: vector chevron, stroked "cuff" ring | med |
| `client/jobway.js:25-28, 55-63, 67-80` | job search area dashed circle; Crazy Taxi / mail rings (ellipses); forklift slot dashed box + chevron | med |
| `client/poolview.js:65-69` | pool balls on the bars' tables: anti-aliased `arc()` dots on the overlay (the pool screen itself uses `arcart.js` sprites) | med |
| `client/casinoview.js:122-135, 157-180` | casino/card-table cards as 3x4 fillRect blocks, roulette ball and chips as fillRect dots, all on the overlay (not in the table's world space) | med |
| `client/main.js:5305-5321` | floating fillRect health bars, "TOUGH/BRUTE" text | low |
| `client/main.js:1493-1505` | map-edge vector arrows | low |
| `client/main.js:3276-3286` | mining progress ring (arc) | low |
| `client/main.js:3827-3837` | stick/touch aim line: dashed with a circle | low |
| `client/main.js:3721, 3728, 4477-4482` | dashed circle/rect outline of you under a bridge or a highway deck | low |
| `client/main.js:4071-4091` | "SPRAY & GO" as plain text on the shutter | low |
| `client/lostposter.js:1-6` | pet's last-seen area: dashed circle on the ground | low |
| `client/main.js:1542` | team rings round peds: stroked ellipses | low |
| `client/main.js:4093-4110` | v1-renderer balls (tennis, grenade, bowling) as arc/ellipse; art v2 has its own (`art2/game/host.js:2196`) | low |

Already converted (not placeholders any more): race checkpoints, cones and buoys (`client/render/racemarks.js`, pixel art since
11-13; only the start label at `:130-131` is plain text - but see the systems notes: they read as pasted on), and the world-event
markers (`main.js:2992-3011`, SNES corner brackets since 11-17).

### 2.2 Comments saying placeholder / stand-in / for now / not yet / later
About 300 whole-keyword hits (later 99, stub 53, stand-in/standin 66, placeholder 43, for now 15, not yet 7, TODO 3; no real
TODO/FIXME/HACK comments). Most are about other things ("stub" of a road, "later" in a function). The ones about unfinished things:
- `client/tunnels.js:9` - road tunnel hills and portals: "Placeholder art in the game's palette, made in code", drawn over art v2 (high - the `portalOnFlat` item)
- `client/art2/items.js:306` - axe and lantern: "placeholder models until the concept sheets come (WD1-WD3)" (med)
- `client/hud.js:547` - weapon pictures in shop menus: "placeholder pixel art until the final weapon art lands" (med)
- `client/main.js:3801` - station clocks and bus boards "interim, flat on the overlay" (med)
- `shared/tunnels.js:12` - closed tunnels: a "ROAD CLOSED" barrier "for now" (med)
- `shared/world3-islands.js:207-208` - roads from island places end at the mainland edge: "the mainland's own build comes later" (med)
- `shared/world3-oldquarter.js:146` - an in-world "COMING SOON: QUARTER YARDS" sign (med - an unfinished place announced in the world)
- `shared/rules.js:336-341` - the carry upgrades (holster, sling, chest rig) "not built yet" (med)
- `client/art2/game/actors.js:201` - a vehicle drawn as a sedan/speedboat stand-in "until the fleet's in" (load-time fallback, low)
- `shared/world3-fenceexits.js:80` builder's gates "closed for now"; `shared/world3-crossings.js:96` a footbridge "a narrow lane for now"; `shared/world3-roads.js:417` a crossing left at grade "for now" (low)
- `client/art2/flora.js:1564`, `client/art2/game/statics.js:2319` "no snow biome for now" (low - no snow is a decision)
- `shared/vehicles.js:164` "procedural placeholder sprites" palette; `client/render/chars.js:8` v1 characters (low)
- `shared/rules.js:1318` crews "up to 4 for now"; `client/titlelife.js:81` title clouds off "for now" (low, decisions)

### 2.3 Features behind flags that are off
- `shared/rules.js:1471-1482` - `DIRECTOR.live: false`: no live street scenes; `bikerbrawl`, `tankerhideout`, `helipursuit` each `on: false` (only `CLA_SCENES` turns them on, `server/systems/director.js:54`). Three built scenes players never see. (high)
- `shared/chatdefs.js:102-103` - `FACTIONS.biker: false` (biker faction chat waits for biker groups - a decision). (med)
- `client/main.js:1662` - `PRACTICE_ON = false` (paused, known). (low)
- `shared/rules.js:23-24` - the career unlock `soon` flag; no unlock uses it today. (info)
- Branch-only, off in main: the Founder's Pack (`founderpack`), the Employment Center (`ads`), inventory (`inventory`) - see PREBETA-LIST E.

### 2.4 Menus standing in for minigames
- `server/systems/casino.js:80-136` - all casino play is a list menu (`t: 'menu'`): roulette = 10 bet buttons (119-125), blackjack = Hit / Stand / Double (85-96) with text cards (`cardItem`/`bjBoard` 69-77), video poker = "Hold the X" + Draw (109-118); `client/hud.js:515-525` draws it as HTML rows of text cards. (high)
- `server/systems/casinofloor.js:169-170` - a poker table opens video poker (`VIEW.pk = 'vp'`, the action reads "Play a hand of poker" - a solo Jacks or Better from the list); the bars' card tables do the same (the Rusty Spur's). (high)
- `client/casinoview.js` animates the regulars' games for show only, on the overlay.

### 2.5 Guide entries that don't match the game
- `shared/guide.js:154` (`cards`) - "poker among the regulars ... play a hand": you get solo video poker from a menu. (med)
- `shared/guide.js:153` (`casino`) - press [[action]] "at a table... to play it" for roulette, blackjack and poker: poker tables give video poker; nothing is played at the table. (med)
- `shared/guide.js:121` (`gangwar`) - "the Syndicate and a biker club": biker NPCs exist (`server/systems/bikers.js`), biker groups don't (confirm the event spawns a biker side). (low)
- `shared/guide.js:54` (`station`) - "Free trains both ways around the line": World v3 has six services (Grand Loop, Pink, Yellow). (low)
- Missing entries (the "teach the new thing" rule): tennis, skateboard (only inside "Races and skating", `guide.js:167`), a dock's "Jump in"; worth checking skydiving, horses, hunting, foraging, gardening, the wood job. (med)
- Nothing behind an off flag has a Guide entry (good).
