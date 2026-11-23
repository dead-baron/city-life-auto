## 3. Systems check

Read against PREBETA-LIST and DECISIONS. Most systems exist and have server tests; almost every 11-17 owner note is still open in the
code.

**Driving.** Shared physics (`shared/physics.js` `vehStep`, server `server/systems/vehicles.js:33-54`), damage by impact and zone
(`vehicles.js:47-52`), toughness by kind (`:285`); horses already have their own handling branch (`physics.js:260,286,314`) - the
pattern a kayak needs. The rider jitter / sound crackle can't be judged from code; the suspect named in the list, the per-tick
cork/uncork write, is still at `server/net.js:134`. Tests: `vehdamage` (13), `drivefx`, `kbdrive`, `motorbikes`, `gridlock`.

**Boats.** NPC boaters, harbor police and angler boats (`server/systems/boats.js`), boat hire in the Guide (`guide.js:96`). Boats
use the generic vehicle step with river drift. Beached rowboats/canoes are props, not vehicles (see `deadBoat`). Tests: `boatjam`,
`fleet`, `world3fleet`, `water`, `world3rapids`.

**Kayak - not started.** `shared/vehicles.js:36` is an ordinary `kind: 'boat'` with motor accel/brake/turn; its `paddle: true` is read
only for seat placement (`client/art2/game/host.js:1915,1948`). No stroke/surge/glide in `physics.js`; the rider uses the default
standing `'ride'` pose (`host.js:1956`); the paddle is a static part of the hull art (`client/art2/vehicles.js:1206-1208`); the sound
is a motorboat's (`client/sound/vehicles.js:227`). No test of its handling or pose.

**Skateboard.** Riding onto rough ground calls `hopOff` - the board dropped at your feet, "Too rough to ride"
(`server/systems/skate.js:228-233, 114-121`); getting on there is refused (`:79`): no carry. The stand-in "thrown board" still flies
on every bail (`client/main.js:1156-1160, 3099-3106`) while the real board lands separately. A snap deletes the board with a
"SNAPPED!" float (`skate.js:186-195`, `client/skate.js:86`) - no halves of the real sprite. `skate.test.js` (14) has no carry test;
the Guide has no skateboard entry of its own.

**Tennis.** Server game `server/systems/tennis.js`, ball sprite `client/art2/game/actors.js:648`, a "thwock" (`main.js:1096`). No
rackets anywhere (no art, no pose). The ball goes through the generic `_small()` with `shadow: true` at height `z0`
(`host.js:2163-2169, 2196`) - the engine's height-marched shadow: the long streak the owner saw. NPCs may walk through a court in
use (nothing keeps them off). Tests: 2. No Guide entry.

**Car soccer.** The replay is gone on the page (`client/carsoccer.js:81`) but still recorded and sent by the server
(`server/systems/carsoccer.js:217,334`) and asserted in `carsoccer.test.js:114,146`; no boost flame (only the HUD ring,
`client/carsoccer.js:203-208`); all its art is placeholder (section 2). 10 tests.

**Racing.** Street-race grid overlaps: `shared/scenes/autorace.js:14-17` puts the cars 36 px apart side by side (`s: 10`, `s: 46`)
while the cars are 48-50 px wide (`shared/vehicles.js:19,113`), rows 120 px apart for 96-104 px cars - the "spawn too close
together". Checkpoints are pixel cones with numbered pennants / buoys on the overlay (`client/render/racemarks.js`), with a drop
shadow, no light - the owner's "pasted on" note. One raceway (a dirt oval). Tests: `water`, `racers`; none on markers or grid.

**Casino.** Your own play is menus (section 2.4); the regulars' games animate over the world on the overlay
(`client/casinoview.js`), not in the table's space; no seated table minigame. Tests: `casino` (6), `casinofloor`.

**Pool (Rusty Spur).** Your game is its own screen (`client/pool.js`). The shot banner is drawn at `T.y1 - 24` (`pool.js:257,274`),
inside the cloth (`shared/pool.js:6` `y1 = 136`) - still over the table. The screen's balls are shaded sprites (`client/arcart.js:34`);
the in-world tables draw vector `arc()` dots over the world (`client/poolview.js:65-69`). No camera freeze while you aim (the camera
overrides at `main.js:3415-3437` have none for pool). Nothing keeps NPCs off the table. Tests: `pool` (6), `poolmatch` (3),
`poolnpc` (6).

**Fishing.** The most finished system: server cast/fight (`server/systems/fishing.js`), page `client/fishing.js`, `fishart.js`,
`fishlog.js`; the 11-16 rod-in-hand rule followed; Guide `fishing` and `rods`. Open: jumping fish use the same stretched shadow
(`client/art2/game/waterlife.js:951`). 14 tests.

**Jobs.** Job board, courier/harvest/contraband (`server/systems/jobs.js`, `phone.js`) and many job modules (bus, taxi, tow, truck,
wood, firefighter, paramedic...), all in the Guide (`guide.js:98-108`). The Employment Center is unshipped (branch `ads`). Tests:
`b8jobs`, `workjobs`, `drivejobs`, `jobway`, `townwork`.

**Shops / wardrobe.** `STARTER_WARDROBE` in (`shared/rules.js:802`), rooms in `shared/shoprooms.js`. The inventory screen and the
SNES menu font are unshipped (branch `inventory`). "RIDE DRINK REPEAT" is still a biker bar's sign line at `shared/shoprooms.js:813`
(bars 480 px wide or more). Tests: `wardrobe` (11), `outfits`, `shoprooms`, `shopmarks`.

**Character creator.** The agreed "My looks" strip isn't built: the footer still has `Add to Saved` (`client/creator.js:469`), `TABS`
still has `'saved'` (`:445`), its empty text points to the mirror (`:566`), the toast names "Add to Saved" (`:210`). Tests: `look`
(13), `wardrobe`, `menupolish`, `titlemenu`.

**Homes.** Buying, respawn at home, garage (`server/systems/homes.js`), inside as its own space (`homeinside.js`), upgrades,
mortgages; Guide entries for homes, mortgage, upkeep. No open PREBETA item. Strong tests (`homes`, `homeinside`, `homeups`,
`homedecor`, `homeart`, `homewalls`, `homereconnect`, `homeprompt`, `homesofa`).

**Transit.** Trains (`trains.js`), bus and taxi (`transit.js`, `taxijob.js`), ferries (`ferries.js`) all exist. Station / stop info is
still flat on the overlay in sans-serif/monospace (`client/render/trains.js:369-396`, `client/render/busboard.js:28-32`, "interim" at
`main.js:3801`); no destination blinds on vehicles; boarding zones are green dashed boxes. Tests: `trains` (19), `transit` (13),
`ferries` (9), `stops` (11), `trainsign` (2).

**Phone and Guide.** Phone hub `client/phone.js`, server `server/systems/phone.js`; the Guide (~110 entries) takes its numbers from
the data. Gaps: no tennis or skateboard entry, no dock "Jump in" line; the casino/cards entries promise table play (section 2.5);
"phone wires that end at nothing" still open per the list. Tests: `guide` (5), `phones` (5).

**Death screen.** The respawn map reads the pointer from the canvas's box (`client/deathscreen.js:262-265`) - the 11-17 fix is in
(source check `test/uiscreens.test.js:101`). The CSS-zoom sweep is clean: the only `offsetX/Y` left in `client/` is that comment;
every canvas that can sit in a zoomed panel (`#menu .panel`, `.hub-frame`, `.jc-pop`, `#d-panel`, `#bm-panel`, `.bm-zoom` -
`style.css:1909,1924,1945`) maps `(clientX - rect.left) / rect.width * W` (`pool.js:36`, `airhockey.js:35`, `skeeball.js:39`,
`pinball.js:112`, `leisure/chess.js:55`, `music/play.js:54`, `arcade.js:73`). The `offsetInZoom` lint row itself doesn't exist yet
(cheap to add as a source test).

**Sign-in.** Complete: providers, email + password (`client/account.js:176-181`), guests, the age gate (`showGate`, `:127`; enforced
when `L.requireAge`, `server/launch.js:102,117`). Pending launch steps: the gate on, the "Loading..." fix. Tests: `launch-auth` (14),
`signin-password` (8), `acctdelete`, `guestnames`.

### Cross-cutting
- **Airborne shadows: no single rule.** At least four paths: the engine's height-marched sprite shadow (the streak) for balls
  (`host.js:2168`), jumping fish (`waterlife.js:951`) and low aircraft (`client/art2/aircraft.js:271`); `_flyShadow`/`birdShadow` for
  birds (`host.js:90,2238`); `airShadow` for aircraft on the overlay (`client/render/aircraft.js:178`); fixed ellipses in v1 `drawBall`
  and car soccer. No test of a high object's shadow length.
- **Night lights: vehicles get no reserved share.** `_packLights` (`client/art2/game/engine.js:1106-1118`) keeps the top N by
  intensity x radius (spot/cone x1.3); N by quality is 16/32/64/96 (`client/art2/game/lightgame.js:19-25`), so lower settings starve
  headlights sooner.
- **NPCs off game areas / furniture: nothing.** The only keep-off rule is skateparks (`server/systems/npc.js:521-540`); inside
  walk-ins NPCs only path round solid props (`npc.js:158-166`). Courts, pool tables, pitches, dance floors and fountains are open.
- **Cinema lobby music: fixed.** `client/sound/places.js:14` maps the lobby song to the bank, hospital and courthouse only.
