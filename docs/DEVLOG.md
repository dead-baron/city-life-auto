# Dev log & playtest guide

## How to send results back

1. **Terminal logs:** every bot run writes `logs/bots-<time>.log`. Attach the file to the chat. For the server, copy the last ~50 lines of the terminal running `npm run dev` (on Oracle: `journalctl -u city-life-auto -n 100 > server.log`).
2. **Screenshots:** take them with the in-game HUD visible. The bottom-right corner shows `fps · ping · entity count`, which helps diagnose. Name them after the checklist item, e.g. `M3-4-crate-fell-through.png`.
3. **Videos:** short phone/OBS clips are fine for your own reference, but I review **3–5 screenshots of the key moments + the matching log** much more reliably than video.
4. **Bug report template** (paste in chat):
   ```
   Milestone / step: M5-3
   Device + browser: Pixel 8 Chrome / Windows Firefox
   What I did:
   What I expected:
   What happened:
   Screenshot(s) / log attached: yes
   ```
5. **Browser console errors:** press F12 → Console, screenshot anything red.

Dev mode (`npm run dev`) adds a playtest panel, opened with the **`** (backtick) key. It has rain/night toggles, money, weapons, wanted levels, a loaded cargo truck, a contraband drop and more, so each checklist below can be done in minutes.

---

## 2026-10-03 · M0 → M8 first full build

**Automated verification run before this entry:**
- `npm test`: 19/19 pass (rules + a 4-minute chaos simulation with 24 random players, 0 system errors).
- `npm run bots -- 100 40 ws://localhost:8080/ws --spread`: 100 players, ~1,300 entities, avg tick ~19 ms (50 ms budget), ~35 KB/s per player, 0 errors.
- Headless-browser playtests on desktop 1280×720, phone landscape 844×390 and portrait 390×844: title, driving, combat, arrest, shop menu, courier job, night, rain.

### M0 · Foundations
Built: zero-dependency Node server (HTTP + hand-written WebSocket), 20 Hz world tick, signed guest tokens, atomic auto-saving profiles, deterministic city generator shared with the client, `/health` + `/stats` endpoints.

Playtest:
1. `npm run dev`, open http://localhost:8080 → title screen shows *Signed in as GuestXXXX*.
2. Press PLAY, walk around, reload the page → you return as the **same guest name** with the same money.
3. Open http://localhost:8080/stats → JSON with `online: 1`.
4. Stop the server with Ctrl+C → terminal prints *saving and shutting down*; restart → money is still there.

### M1 · Playable skeleton
Built: canvas renderer (baked ground chunks, rooftops, signage, lane markings, crosswalks, traffic lights), client-side prediction + server reconciliation, 110 ms interpolation of everyone else, chunk net-culling, keyboard/mouse + Xbox gamepad + touch sticks/buttons, 16:9 scaling with a portrait strip, speed-based camera zoom, radar + big map (M), sprite atlas from your concept art.

Playtest:
1. Two browser windows side by side → each sees the other player move smoothly with a name tag.
2. Walk into a parked car, press **F** → drive; **Space** handbrake-drifts (tire marks); camera zooms out at speed.
3. Plug in an Xbox controller → it works without settings. On a phone (same Wi-Fi, `http://<PC-IP>:8080`) → touch sticks appear.
4. Rotate the phone to portrait → the view becomes a narrow strip (no zoom) with a "rotate" banner.
5. `npm run bots -- 30 60 ws://localhost:8080/ws` while playing → bots appear, game stays smooth; attach the `logs/bots-*.log`.

### M2 · Life cycle & saving
Built: health, bleeding below 30% with red footprints on dry concrete, death → WASTED screen → hospital respawn, value-tiered loot bags (duffel → backpack → security case → gold lockbox), **30-second ghost state** on disconnect, banked money survives death, continuous autosave.

Playtest:
1. Dev panel → *Give weapons*, walk up to a citizen and fight; get hurt below 30 → HUD says BLEEDING and red footprints trail on sidewalks.
2. Die (or drive into traffic) → WASTED, respawn at St. Neon General with $0; a loot bag sits where you died. In a second window, walk to it and press **E** to loot it.
3. With $ in your wallet, close the tab. In the other window watch your body stay ~30 s, then pop into a loot bag.
4. Reopen within 30 s instead → you're back in the same body with your money.
5. Deposit at First Pixel Bank / ATM (E) → die → bank balance is unchanged.

### M3 · Vehicles & open cargo
Built: 15 vehicle models (compact, sedan, taxi, sports, pickup, flatbed, van, bus, police, SWAT, ambulance, armored, motorcycle, speedboat, dinghy), multi-seat passengers, surfaces (grass/sand/dirt slow you), wrecks + explosions + fire, hydrant geysers, motorcycle crash ejection, physical crates: carry (−40% speed), throw, load into visible slots, knocked off in hard crashes, tossed crates land in truck beds, crates sink in water.

Playtest:
1. Dev panel → *Loaded flatbed* → a truck with one crate of each tier appears; drive it into a wall hard → crates fly off.
2. Walk to a crate, **E** pick up (you slow down), **Q** or click to throw it; stand near an empty pickup bed holding a crate → prompt *Load onto Pickup Truck*.
3. Throw a crate onto an empty pickup bed from beside it → it snaps into the bed.
4. Two players: one drives, the other presses **F** on the same car → passenger; passenger can aim and shoot (mouse/right stick + click).
5. Harbor Marina (B on radar) or the piers: take a boat; press F at the dock edge to get out.

### M4 · Combat
Built: fists, bat, knife, crowbar, sledgehammer, baton, taser, pistol, revolver, shotgun, rifle, SMG, bazooka; hitscan with walls blocking, tracers, muzzle flashes that light the night, blood sprays + stains, hood blood on cars that hit people, stun/knockdown, reload (R), heal items (X), passenger drive-bys.

Playtest:
1. Dev panel → *Give weapons*. Cycle with Tab/wheel/1-9; check the ammo counter and reload.
2. Shoot at a car until it smokes, burns and explodes; nearby people get knocked back.
3. Run someone over → blood on your hood; Fresh Coat Garage (R on radar) → *Car wash* cleans it.

### M5 · Law & tri-faction
Built: witness network (NPC sight cones + traffic cameras, both weaker at night), 3-second red "!" public flare, wanted stars, out-of-sight search circle on police radar that grows as heat cools, legal immunity (self-defense, flagged outlaws, gang turf), NPC police units (taser + baton at 1–2★, firearms at 3★, SWAT at 4–5★), arrests with fines and confiscation, contraband spotting, **disguise system with peak-wanted memory**, enforcer badge (25 Samaritan, no felonies) with misconduct firing, bounty hunter license, player-placed bounties at the courthouse.

Playtest:
1. Punch someone in an empty alley with nobody looking → toast *nobody saw it*. Do it in front of people → stars + red "!" over your head for 3 s.
2. Dev → *4 stars* → police cruisers with sirens arrive; hide behind buildings and watch the stars cool off. A traffic camera blinks red and beeps when it spots you.
3. Get 3 stars, break line of sight, go to Threads Outfitters (D) → buy an outfit → stars drop to 0, HUD shows *Record on file ★★★*. Commit any small crime in view → straight back to 3★.
4. Dev → *+50 Samaritan*, go to Police HQ (P) → pick up badge → uniform + taser/baton/pistol; *Requisition a Police Interceptor*, H toggles the siren. In a second window give that player stars; arrest them by tasing then pressing E.
5. As an on-duty cop, punch a clean citizen → Samaritan points drop; keep doing it → FIRED.
6. Have player B punch player A; A goes to the courthouse (J) → place a bounty on B → hunters see a pulsing ring on the radar.

### M6 · Living city
Built: demographic pedestrians (executives, socialites, construction crews, sweepers, athletes, seniors, hustlers, drunks; more shady types at night), sidewalk wandering + jaywalking, reflex dive rolls away from speeding cars (athletes ~80%, drunks ~5%), fight-or-flight when attacked, carjacking (50% flee screaming / 50% fight and drag you out), syndicate gangs in the south-west turf that defend it, NPC traffic on a lane graph obeying traffic lights, parked cars, panicked drivers, ambulances that revive downed NPCs in 3 s, bodies dissolve after 45 s if unreachable, snatch-and-grab street muggings, scattering pigeons and gulls.

Playtest:
1. Stand at a big intersection for a minute: cars stop on red, go on green, turn at corners.
2. Drive fast along a busy sidewalk → some people dive out of the way, slow ones don't.
3. Pull a driver out of their car (F on an NPC car) several times → some run, some beat you up.
4. Knock someone down and wait nearby with no shooting → an ambulance arrives, medics revive them.
5. Wait for a *Snatch-and-grab!* toast → chase the mugger, knock them down, grab the purse, then either return it to the victim (E → +Samaritan) or sell it at Second Chance Pawn.

### M7 · World systems
Built: 20-minute chrono loop (15 min day / 5 min night) synced to all players, night darkness with street lamps, headlight cones, siren glow, shop-front light pools; rare rain (−35% asphalt grip, double braking distance, umbrellas, rain streaks, slick boats); waterfront with beach, piers and ocean; river and bridges to the rural Refuge Island with farm fields.

Playtest:
1. Dev → *Jump to night*: lamps and headlights light the streets; more hustlers/drunks appear.
2. Dev → *Start rain*: brake from top speed on asphalt → you slide about twice as far; umbrellas pop up.
3. Drive east across a bridge: the camera at the bridge approach pings wanted players.

### M8 · Economy & jobs
Built: Iron Sights Arms, Second Chance Pawn (sells stolen goods safely), Back-Alley Exchange black market (SMG, bazooka, fences contraband), Home Run Sports (bat, fishing pole), Nail & Gear Hardware, MediMart Pharmacy, Bean Machine Coffee + vending machines (stamina buffs), ER reception auto-heal ($150), bank + ATM, Motor Row dealership + Harbor Marina (owned vehicles saved to your profile, retrievable anytime), Fresh Coat Garage (respray disguise, wash, repair), Portside Logistics courier contracts, Refuge Island harvest contracts (4 produce boxes → FreshHub Grocery), contraband drops (iron vaults / carbon-gold cases with a map rumor; fence them or turn them in at PD for Samaritan points), fishing with bite timing + time/location tables (catfish at night, tuna in deep water, lures).

Playtest:
1. Portside Logistics (W) → courier contract → load the crate on any vehicle with a bed → drive to the yellow marker → carry it to the door → E → paid.
2. Refuge Island farm (¥ on the east island) → harvest contract → load 4 boxes on the co-op pickup → FreshHub Grocery (F) → paid + bonus.
3. Dev → *Contraband drop* → follow the dashed rumor ring → grab the glowing case → choose Back-Alley Exchange (X) for big cash, or Police HQ for Samaritan points. Carrying it past a cop gets you wanted.
4. Buy a fishing pole at Home Run Sports, stand at a pier edge facing water → E to cast → when **BITE! PRESS E** flashes, press E → sell fish at Dockside Fish Market (≈).
5. Buy a pickup at Motor Row (V) → log out and back in → retrieve it from the dealership or garage menu.

### Known gaps / next
- **M9 accounts & social:** Discord/Google sign-in, username choice, chat with filter, mute/report, leaderboards.
- **Final art:** characters, buildings and tiles are procedural stand-ins in your palette; vehicles and crates come from your concept sheets. See ART_SPEC.md.
- Bridges don't open (drawbridges), no jet skis or lost-pet events yet, gang alignment perks are basic (≥200 Criminal EXP stops gangs reacting to gunfire).
- NPC traffic uses straight lane graphs; police can drive onto sidewalks during direct pursuit (intended), and occasionally get wedged on corners (they reverse out).

---

## 2026-10-03 · Offline practice mode

**Built:** a **PRACTICE OFFLINE** button on the title screen. It runs the complete authoritative city simulation (the same `server/` code) inside a Web Worker on your own device. It needs no server and no internet once the page has loaded. You start with $2,000 cash and $5,000 bank, and the cheats panel is always on (` key, or the DEV button on phones). Nothing is saved, and your online guest token/profile is never touched.

Code changes: `server/session.js` (handshake + message routing shared by the Node server and the worker), `server/store.js` (environment-neutral profile store; the Node server plugs in `server/file-store.js`), `client/practice-worker.js`, and a WebSocket-compatible worker transport in `client/main.js`.

Playtest:
1. Open https://deadbaron.com/city-life-auto/ (even before the Oracle server exists) → title says the online city isn't reachable → press **PRACTICE OFFLINE** → you're in.
2. HUD shows *CITIZEN · PRACTICE*. Press ` (or DEV) → spawn the loaded flatbed, give weapons, start rain, etc.
3. Reload the page → practice money/items are gone (by design). Your online guest (once the server is live) is unaffected.
4. On a phone: same flow; the DEV button sits under the touch buttons.

---

## 2026-10-03 · Art pass, GTA-style city, punches, hospitals & homes

**City layout.** The generator was rewritten (`shared/map.js`). Four avenues and two bridges split the mainland into **nine districts with their own look**: Pine Hills (suburbs), Midtown (shops), Northgate (apartments, school, fire station), The Yards (industrial Syndicate turf, potholed asphalt), Downtown (towers, slate plazas, PD, bank, courthouse), Civic Center (hospital, chapel, Central Park), Southside (rough houses + turf), Neon Strip (clubs, hotels, red-brick sidewalks) and Harbor, plus Sunset Beach, the piers and Refuge Island. Each district is cut into irregular blocks with mixed street widths and T-junctions. A district title card pops up when you cross into one. The map grew from 256x256 to 384x352 tiles.

**Art.** Buildings are the actual lots from your building sheet. Roads, sidewalks, plazas and water use textures cut from your style-guide sheets, and about 70 street props come from the props sheet (`tools/build_art.py`). The bus and armored truck now use concept art too.

**Vehicles.** The dark rectangles under cars are gone; shadows follow the car outline. Every car keeps the art's own proportions and its collision box is the sprite itself.

**Combat feel.** Fists throw alternating left/right jabs (4 frames), and bats/crowbars/etc. swing in an arc with a motion trail. Hits make the victim flinch and flash, with an impact burst and screen shake. Your own punch animates instantly (predicted locally). Quick clicks can no longer be lost.

**Respawning.** There are 3 hospitals (St. Neon General, Westside Medical, Southside Clinic). The WASTED screen has a picker for where to wake up; by default you wake at your home, or else a hospital away from where you died.

**Homes.** There are 70+ buyable houses ($25k, $12k in turf) and apartments ($15k). Walk to the door and press E to buy. A home becomes your respawn point, has a Rest option (full heal), and comes with a garage: drive *any* car (yes, stolen ones too) up to your driveway and press E to park it, then take it out again from the door menu. Garage space is 2 + 3 per house / 2 per apartment, up to 3 homes.

Playtest (offline practice works for all of these):
1. Walk/drive across the city and watch the district title cards; compare Pine Hills, Downtown, Neon Strip and The Yards.
2. Punch the air and a pedestrian: arms should visibly jab; the victim flinches with a white impact burst.
3. Dev panel → +$25k → walk to any house door ("For sale" prompt) → buy it. Die (drive into traffic): the WASTED screen lists your home + 3 hospitals; pick one.
4. Steal any car, drive up to your house's driveway, press E → "parked in your garage". Walk to the door → E → *Take out*.
5. Check cars: no boxes around them; bumping into one should match where the art is.

### Screenshots from the automated browser playtest (2026-10-03)
![Street, day, loaded flatbed](screenshots/street-day-cargo.jpg)
![Night + rain driving](screenshots/night-rain-driving.jpg)
![Courier job](screenshots/courier-job.jpg)
![Gun shop menu](screenshots/gun-shop-menu.jpg)
![Busted at Police HQ](screenshots/busted-at-pd.jpg)
![Mobile landscape + portrait](screenshots/mobile-landscape-portrait.jpg)

## 2026-10-03 · Character redraw

Players and every NPC archetype are now redrawn as top-down 16-bit pixel art in the concept-sheet style: a 24x24 art grid (1 art px = 2 world px, the same scale as the buildings), 3-tone shading, and a dark outline. They are drawn crisp, with no blur. Outfits are layered from the appearance the server already sends, so each archetype reads at a glance:
- suit and tie (executives)
- hard hat and hi-vis vest (construction)
- sun hat and dress (socialites)
- uniform and badge (cops)
- helmet and visor (SWAT)
- red bandana (gang)
- fur coat, hoodie, cardigan, briefcase, purse and tool bag

Animations:
- 8-frame walk and run, with legs that visibly step out
- breathing idle
- left/right jabs, where the fist extends past the body
- melee arc swing with weapons in hand
- aim, carry, fishing, dive roll, knocked down and dead

Each sprite is cached per look, pose and frame. You can preview every archetype and pose at `/tools/character-preview.html`.

![Character lineup](screenshots/characters-lineup.png)

## 2026-10-03 · GTA2-style city layout + sharp art

**World layout (modelled on the GTA1/GTA2 level maps).** The city is now three islands separated by water channels and joined by bridges, plus a farm island:
- **Industrial:** Harbor docks, Ironworks, Greenfield Park with a pond, and The Yards (gang turf).
- **Residential:** Pine Hills, Northgate, Southside (gang turf) and Sunset Beach with piers.
- **Downtown:** Civic Center with Central Park, the Downtown towers, Midtown shops and the Neon Strip.
- **Refuge Island:** reached over a causeway from Neon Blvd; farm, fields and woods.

Each island has a coast ring road with a waterfront outside it: quays, promenade, lawns or beach, with piers and marinas. Inside, a hand-laid avenue grid has T-junction stubs, and every cell is cut into irregular blocks of mixed sizes. Blocks are lined with the concept building lots. Leftover lots and small blocks become solid rooftop buildings, so the city reads dense like the originals:
- tar, gravel, corrugated metal, glass or terracotta roofs
- parapets
- AC units, tanks, skylights and helipads cut from the concept roof tiles

The district title now shows the island under it. Crossing a bridge shows "Liberty Bay". The map is 432x416 tiles, up from 384x352. Three hospitals, one per island: St. Neon General, Westside Medical and Ironworks Clinic.

**Sharper graphics.** Buildings were blurry because the concept-sheet lots were stretched 2x at runtime. The art build now upscales them 4x with Real-ESRGAN, using a small torch-free numpy port in `tools/sr_upscale.py`. It then stores them at exactly 1 art px per world px, drawn nearest-neighbour. Grass, sand and dirt are new seamless pixel-art textures. The world only uses smoothing while zoomed out at speed, to avoid shimmer.

**Tools.** `/tools/map-preview.html?scale=0.125` renders the whole city with the game's own chunk baker, plus district labels.

Load test, 100 bots spread over the new map: 13–14 ms per tick (of a 50 ms budget), about 15 KB/s per player, 0 errors. All 21 tests pass.

![City map](screenshots/city-map.jpg)

## 2026-10-03 · Art pass: blended blocks, reference hospital, night + rain

**Blocks blend together.** There are no more asphalt or odd-coloured patches between buildings. Every lot now sits on its district's own paving or lawn: Midtown is continuous concrete like its sidewalks, Downtown slate, the Neon Strip brick, and Pine Hills lawns. Each concept lot has feathered edges, so it fades into the surrounding paving instead of reading as a pasted rectangle.

**New hospital (all three hospitals),** built from the rainy-night street reference:
- the reference's lobby facade: lit glass, red-cross sign, entrance canopy and planter beds
- a parapet roof with a helipad, AC units, tanks, a skylight and a rooftop red cross
- a paved forecourt with tree planters, lamps and benches either side of the doors

**Night.** Every building lot has a generated emissive layer: facade glass turns warm yellow, lit windows and neon signs keep their colour, with a soft halo. It is drawn additively after dark. Street-lamp pools are bigger and warmer.

**Rain.**
- Wet asphalt reflects headlights (warm), tail and brake lights (red), sirens, street lamps and lit shopfronts as broken vertical streaks.
- Cars throw tyre spray.
- Drops splash on the ground.
- Most pedestrians now open umbrellas, drawn as pixel-art canopies in six colours.

![Hospital, day](screenshots/hospital-day.png)
![Hospital, night + rain](screenshots/hospital-night-rain.png)

## 2026-10-03 · Twin-stick controls, smooth movement, mobile UX, GTA-style HUD

**Animation fix.** The 8-frame gait jumped from the full stride on one side straight to the other side, so walk and run never looped cleanly. Stride now follows a sine over the 8 frames. Each ped also has a walk phase driven by how far it actually moved on screen. Stride length and leg amplitude blend across four speed levels (stroll, walk, jog, run), so walking eases into running without the loop resetting.

**Movement feel.** How far you push now sets your speed:
- a light push walks, full push runs, and sprint adds a stamina burst on top
- speeding up eases in; letting go glides a short way before stopping
- the character turns smoothly instead of snapping

On keyboard, C or Ctrl walks.

**Driving.** The stick, keys or thumb point where you want to go:
- the car steers toward that direction, and push depth sets cruising speed
- pull back hard to brake, then reverse with the rear swinging round
- Settings has "Classic tank" driving for keyboard players who prefer W = gas, A/D = steer

**Twin-stick aiming.**
- Keyboard + mouse: WASD moves and the cursor aims. With a gun out you always face the cursor. Unarmed, you face where you walk and turn to the cursor to punch.
- Gamepad: the left stick moves or drives and the right stick aims. RT fires, LT sprints on foot or works as the handbrake in a car. A rolls, B interacts, X gets in or out, Y throws, LB/RB switch weapons, R3 reloads, Menu opens the map.
- Touch:
  - the left thumb-stick appears wherever you touch the left side
  - the right stick aims, shown with an aim line
  - firing is deliberate: tap the big FIRE button (it uses your last aim for about a second), or push the aim stick into its red outer ring, which buzzes when it engages
  - the ring can be turned off in Settings

**Device-aware hints.** The game detects touch devices and shows touch controls and help from the title screen onward. Prompts are GTA-style help boxes showing the right button for your device: a key cap, an Xbox-colour face button, or the on-screen button name. On touch, the matching button pulses. Contextual buttons:
- THROW appears only when carrying
- RELOAD only when armed
- HORN and BRAKE only in a car

Tap the weapon box to switch weapons and the radar to open the map.

**Fullscreen and landscape.**
- Mobile goes fullscreen when you press play, and there are ⛶ buttons on the title screen and in the HUD.
- Android also locks to landscape.
- iPhone gets an Add-to-Home-Screen hint.
- In portrait, a "landscape shows more" tip appears once and fades out.

**GTA-style HUD.**
- Fonts: Anton and Barlow Condensed, self-hosted.
- Top-right: weapon pixel icon and ammo, big outlined green money, white wanted stars.
- Bottom-left: circular radar with health and stamina bars.
- Help box and notifications top-left.
- Interaction-style shop menus.
- WASTED card over a desaturated screen.
- Skewed title buttons.

![Mobile landscape HUD](screenshots/mobile-hud-landscape.png)

## 2026-10-03 · NPC toughness + fist fights, gamepad pause menu

**Why punched NPCs didn't die.** Fists did 8 damage against about 100 HP. Every punch shoved the target out of reach, and anyone who fled sprinted faster than you could chase. So a fist fight in practice never ended.

**Builds.** Every NPC now rolls a build, weighted by type: seniors are mostly frail, construction workers often tough, Syndicate heavies often brutes. Brutes are drawn bigger and frail people smaller, so you can size up a fight before you start it.

| Build | Health | Hits back with | Notes |
|---|---|---|---|
| Frail | 0.55x | 0.65x | flees more |
| Average | 1x | 1x | |
| Tough | 1.45x | 1.4x | more likely to fight back |
| Brute | 1.8x | 1.6x | needs 4-hit combos to floor |

**Fist fighting.**
- Fists hit for 10, with a shorter shove scaled by your strength against their poise, so you can keep a combo going.
- Three hits in quick succession is a KNOCKDOWN (four against brutes, and four against players). Hits on someone who's down do 1.5x.
- NPC brawlers swing a little slower than players.
- A health bar appears over whoever you're fighting, tagged TOUGH or BRUTE.

Simulated standing slugfests (480 fights, no dodging): you beat frail NPCs 100% of the time in about 4 punches, average 99% in about 8, tough about 88% in about 13, and brutes about 32%. Rolling and footwork improve those odds.

**Gamepad pause menu.** Start/Menu (or Esc) opens a GTA-style pause menu: Resume, Map, Settings, Controls, Toggle fullscreen, the Debug / cheats menu (dev and practice), and Back to title. The D-pad or left stick moves, A selects, left/right changes a setting, B goes back. The settings and debug panels are fully navigable with the pad.

## 2026-10-03 · Gamepad title screen + GTA-style trigger driving

- **Title screen:** the pad now works from the start. The D-pad or left stick moves between PLAY, PRACTICE, SETTINGS and FULLSCREEN, A or Start presses, and settings opened from the title are navigable too (B closes).
- **Driving with a pad is back to triggers, GTA1/2-style:**
  - RT gas and LT brake, then reverse (both analog, so a light squeeze cruises)
  - left stick steers, A handbrake
  - right stick aims drive-by fire, and pushing it all the way out shoots
  - a "point the stick where to go" option remains under Settings → Gamepad driving
- On foot nothing changes: left stick moves, right stick aims, RT fires.

## 2026-10-03 · Updates go live instantly + controller trigger fix

- **Why the RT driving fix seemed missing:** GitHub Pages lets browsers cache the game's JavaScript for 10 minutes, so right after a push you could still be running the previous controls code. `client/boot.js` now checks `version.json` uncached on every launch. When the build changed, it re-downloads every game file fresh before starting. The title screen shows the build id and time, so you can see which version you're on.
- **Release step:** run `node tools/stamp-version.mjs` before committing (it rewrites `version.json`).
- **Controllers that report triggers as axes:** some browser/OS combinations expose an Xbox pad without the standard mapping, with triggers on axes 2 and 5 resting at -1 and the right stick on axes 3/4. These are now detected, so RT/LT work there too. Tested with both layouts in the automated browser: RT accelerates, LT brakes and then reverses.
- Hard steering no longer scales the gas down in trigger-driving mode.

## 2026-10-03 · Destructible streets, signal poles, traffic loop fix, cash drops, smoother driving

**Destructible props.** About 60 kinds of street furniture now break:
- trees and palms
- lamp posts and hydrants
- bins, benches, planters and bushes
- newsstands, vending machines and mailboxes
- cones, barriers, pallets, drums, spools, carts and umbrellas

How it works:
- A car above roughly 85 px/s ploughs through instead of bouncing off, and loses some speed doing it. Trees, lamp posts and hydrants dent the car.
- Explosions also smash props in their radius.
- Breaks are server-authoritative and broadcast to everyone, and late joiners get the list in their welcome message. The ground is re-drawn with debris. Trees topple over beside a stump, lamp posts lie in the street, and smashed hydrants spout a geyser that drags passing cars.
- A tidy-up crew restores props after 4 minutes, but only when no player is within view.
- Fountains, dumpsters, ATMs and market stalls stay solid.

**Poles.**
- Traffic signals hang from mast arms: a pole on each corner with an arm over the approaching lanes and a 3-lamp head. The signal lamps glow at night.
- Street lights are poles with an arm over the road. The lamp head is lit at night, the light pool comes from the head, and they can be knocked down.
- Traffic cameras sit on yellow-banded poles with a white housing pointing at the junction.

**Traffic stuck in circles.** A waypoint inside a car's turning circle made drivers orbit forever. Drivers now drop that waypoint after about one lap, and re-join the road network at the nearest junction after about two. In a 4-minute simulation with 3 players, 10 of 154 traffic cars were caught orbiting before the fix and 0 of 230 after.

**Backwards vehicles.** The bus and the armored truck were cut from the sheet facing the wrong way. Fixed.

**Cash drops.**
- Not every NPC carries money: about 90% of executives do, but only about 30% of drunks.
- When the only loot is cash, it drops as a little pile of bills you scoop up by walking over it, with a floating "+$N".
- Bags are kept for item loot.

**Smoother driving.**
- When the server catches up on a backed-up input queue, it now gives the car the extra physics step the client already predicted. This removes a steady source of corrections.
- Heading corrections are eased instead of snapped.
- In a car, position corrections ease over about 150 ms.
- The camera's look-ahead follows smoothed velocity instead of the raw heading.

![Smashed lamp post + hydrant geyser](screenshots/smashed-lamp-hydrant.png)
![Signal mast arms, lamp poles, camera pole](screenshots/signals-lamps-camera.png)

## 2026-10-03 · Installable app (separate from the other deadbaron.com games)

City Life Auto now installs as its own app from Chrome (Android "Install app", or the ⬇ INSTALL APP button on the title screen when Chrome offers it):
- **No overlap with the other games.** `manifest.webmanifest` has `id` and `scope` `/city-life-auto/` and start URL `/city-life-auto/?source=app`, so it installs next to Neon Asteroids (`/neon-asteroids/`) and Gear Bugs (`/gear-bugs/`) without clashing.
- **Display:** fullscreen, landscape.
- **Icons:** made from the logo, including maskable versions for Android's icon shapes, plus an iOS home-screen icon.
- **Service worker (`sw.js`):** scoped to `/city-life-auto/` and only ever clears its own `city-life-auto-` caches. It's network-first, so updates still land immediately, and keeps the cached copy as an offline fallback.
- **Offline practice:** after one online visit, Practice works with no connection, because the boot loader's version check pre-loads every game file.
- **Verified in Chromium:** no manifest errors, no installability errors, the service worker controls only `/city-life-auto/`, and offline practice runs after a reload with the network cut.

## 2026-10-03 · Cop-car theft, world map, police ranks + dispatch map, debug tools, portrait fullscreen

- **Stealing police cars works.** When you jacked a crewed cruiser, the officer you threw out was immediately able to drag you back out (NPCs pull drivers from slow cars). Now:
  - A jacked driver is knocked to the ground for about 1.6 s.
  - NPC passengers bail out too.
  - Officers from a hijacked unit chase and shoot instead of dragging you out.
  - Civilians only try to drag you out once every 6 s.
- **World map.** `assets/worldmap.webp` is baked from the game's own renderer (`python3 tools/build-worldmap.py`). It opens with M, the new ▦ HUD button, a tap on the radar, or Start → Map, and shows:
  - district names
  - shops and services
  - your homes, job and drop rumors
  - you
- **Police ranks.** Officer → Senior Officer → Sergeant → Lieutenant → Captain → Chief of Police. Ranks come from service points: arrests (10 × stars), NPC custody (4) and bounties (15). Promotions are announced, and the HUD shows "POLICE · RANK".
- **Police dispatch map.** On duty, the world map becomes dispatch:
  - **Crime reports:** only crimes a witness, camera or officer actually reported, plus purse-snatching calls. Each shows its age, and higher ranks keep reports longer.
  - **Live suspect markers:** only while someone can currently see them.
  - **Last-known search areas:** once a suspect slips out of sight. Nothing shows once they're gone.
  - **Fleeing NPC muggers:** while you have line of sight.
- **Debug menu:**
  - "Wipe criminal record (felonies)": clears wanted level, felonies, peak-wanted memory and any firing.
  - "Join the police (badge + rank)"
  - "Promote police rank"
- **Fullscreen in portrait:** the landscape lock is gone, and the installed app's manifest orientation is now "any".

![World map](screenshots/world-map.png)
![Police dispatch map](screenshots/police-dispatch-map.png)

## 2026-10-03 · Rotation in fullscreen and in the installed app

- The game now asks the phone to follow its rotation sensor (`screen.orientation.lock('any')`) whenever it is fullscreen, and at launch when running as the installed app. This overrides an install made while the manifest still said landscape-only; Android only refreshes an installed app's manifest after about a day.
- Rotation re-fits the canvas and switches between the landscape and portrait HUD and touch layouts. The game listens for `resize`, `orientationchange`, `screen.orientation` change and `visualViewport` resize, because a rotation in fullscreen doesn't always fire `resize`. Canvas sizes are only reset when they actually change.
- Tested in headless Chromium by rotating mid-game from landscape (844×390) to portrait (390×844) and back: the canvas and portrait layout switched each time.

## Reinstall after uninstall
- Manifest `id` bumped to `/city-life-auto/app` (start_url `?source=pwa`) so phones holding a stale install record see a brand-new app; `related_applications` lets the page detect an existing install.
- Install button is always shown outside the app. It uses Chrome's native prompt when offered; otherwise it opens an install sheet with per-browser steps plus "already installed?" fixes.
- Settings → "Repair install": unregisters only the `/city-life-auto/` service worker, deletes `city-life-auto-*` caches, clears the build stamp and reloads. Other deadbaron.com games and saves are untouched. SW cache bumped to v2.

## Personal police cruisers
- Going on duty (HQ badge desk or dev "Join the police") puts you behind the wheel of your own Interceptor immediately.
- Cruiser wrecked or stolen → a 15 s cooldown, then **Call cruiser** (V / D-pad down / COP CAR touch button / pause menu). An NPC officer drives a new one to you, parks within ~150 px, gets out and walks off. If it's stuck in traffic for 45 s it's placed right next to you instead.
- A delivered (or HQ-requisitioned) cruiser stays locked to its officer until they first get in; after that it's an ordinary police car that can be stolen.
- Blue chevron orbits the player pointing at the cruiser, a red/blue marker bobs over it, and it shows as a blue square on the radar and world map.
- Leave it more than 900 px behind for 25 s (or cross town) and it's towed back to HQ: no cooldown, call another any time. Going off duty or logging out returns it to the pool.
- New system `server/systems/cruiser.js` runs after police in SYSTEMS. `me.cruiser = { s: none|coming|parked|in, cd, id, x, y }`. Client→server message `{ t: 'cruiser' }`.

## Police kit, misconduct grace, knock-out arrests, bail-outs and blasts
- **Service pistol:** going on duty issues the Police Service Pistol (15-round mag, 75 rounds) and equips it. The Police HQ menu gains a free "Armory: restock service pistol ammo". Your own weapons stay usable on duty. Department gear (taser, baton, service pistol) is handed back off duty or lost on death.
- **Misconduct grace:** officers get 3 strikes. Murder and vehicular homicide count 2, killing an officer counts 3, and shots fired don't count. Each strike expires after 10 real minutes. Graced crimes carry no heat; you get a warning toast, and the HUD faction line shows `MISCONDUCT n/3` (flashing at the last strike). One more strike: fired (10-minute lockout), and that crime counts normally.
- **Cruiser arrow removed:** the cruiser now only appears as a blue square on the radar and world map.
- **Crime blips:** dispatch reports within radar range pulse on the minimap for 2 minutes.
- **Suspect markers:** officers see a small red/blue chevron over visible criminals (wanted players, flagged NPCs). It becomes a pulsing ring once the suspect is down, meaning you can cuff them.
- **Arrests need a knockout:** the suspect must be floored, tased, tackled (dive into them) or run down. Officers and hunters who floor a suspect keep them down for 6 s. Being badly hurt is no longer enough. Walk up and interact: "Cuff X". Dead suspects (NPC or player) leave a body to "Book" for a smaller reward. Fixed: player-made arrests never paid out (the player object was passed instead of the ped).
- **Blown up in a car:** you're thrown clear. 50% dead; otherwise down at 6–16% HP, bleeding, for 3.5 s.
- **Bailing out above 140 px/s:** you roll out and slide (new `tumble` ped mod, shared with prediction, friction 2.2/s), down for up to 2.6 s. Damage scales with speed. Hitting a wall or car mid-tumble hurts more and can kill. The client draws the roll pose while a downed ped is still moving fast.

## City tour (tutorial cut scene)
- **Script:** `shared/tutorial.js` holds 30 stops in 6 chapters: The City, Survival Basics, Citizen Path, Criminal Path, Police Path, Your Move.
  - Stops point at POI kinds, districts, islands, traffic cameras, drop sites, gang turf and home clusters, resolved against `generateCity()` at play time.
  - Text tokens: `{{kind}}` / `{{kind:where}}` give live names and districts, and `[[action]]` gives the device-specific key or button.
  - Numbers come from the new `shared/rules.js`. Police, arrest, respawn and hospital constants moved there, and the server imports them.
  - Island stops list the places that are actually on that island.
- **Player:** `client/tutorial.js` flies a camera over the real city: the world-map image when zoomed out, live-baked chunks when zoomed in.
  - Pulsing rings and labels mark places; demo vehicles drive real road routes (courier van, harvest pickup, getaway car with a cruiser in pursuit, police call with siren).
  - Steps auto-advance with a progress bar, with Back / Pause / Next / Skip and chapter tabs. Keyboard: ←/→, Space, P, Esc. Gamepad: d-pad/stick ←/→, A, B. Touch: tap.
- **When it plays:** it plays before a first-timer's first Play or Practice (Skip always available). A title-screen card offers it too, along with a "📖 VIEW TUTORIAL" button and a pause-menu entry.
  - Seen state is stored as `cla.tutorial` = `TUTORIAL_VERSION`; bumping the version re-offers the updated tour.
- **Controls:** the key/button tables moved to `shared/controls.js`, read by both the HUD glyphs and the tour.
- **Guard rails:** `test/tutorial.test.js` checks that every stop and route resolves on the map and that all place tokens resolve. It also requires every POI kind, island, turf, camera/drop-site stop, control action and rule constant to be covered. This caught the missing gas/brake/pause explanations. The upkeep rule is in `CLAUDE.md`.

## Fix: title screen jumping on mobile
- While the online server was unreachable, every reconnect attempt rewrote the status line between a one-line "Connecting to …" and the two-line "isn't reachable" message. On narrow screens that changed its height, and the centred title column (buttons, tutorial card) jumped ~19 px every few seconds.
- Now only the first attempt says "Connecting…"; retries keep the current message. `#t-status` also always reserves two lines, so status changes can't shift the layout.

## Fix: driving jitter, dark circles, grey box on wrecks
- **Car vibrating / blurry while driving:** when a tick's input hadn't arrived yet (phone timer jitter, network hiccup), the server still stepped the player's car with the last input. The server ended up a step ahead of the client's prediction, and every snapshot corrected the car back and forth (up to 15 px in a jitter simulation).
  - Player-driven cars are now stepped exactly once per received input (`vehicles.stepVehicle` from `players.processInputs`); the vehicles system skips them.
  - A late input holds the character/car for up to 250 ms (`HOLD_TICKS`) instead of guessing.
  - The car's reverse-gear state is now sent to the driver (self flag 32), so point-to-drive prediction matches when reversing too.
  - New test: uneven input arrival, prediction must match the server exactly (it does: 0.0 px).
- **Random dark circles:** explosion scorch marks were flat 66 px solid discs. They're now a soft, ragged soot blotch texture (built once, cached).
- **Grey box around burning / wrecked cars:** the wreck tint was a filled rectangle over the whole sprite box, transparent corners included. Wrecks now draw a cached, charred copy of the car sprite (tint applied to the car's pixels only).
- Playtest hook: add `?debug` to the URL to expose the client state as `window.__S`.

## Water, bridges, world events, fling landings, gamepad respawn
- **Gamepad on the death screen:** D-pad / stick picks where to wake up, A confirms, and the label shows the buttons.
- **Docks and water:** `CAR_BLOCK` no longer includes docks or water.
  - A land vehicle whose centre enters water starts sinking: occupants spill into the water, and after `SINK_S` (3.2 s) it blows up underwater (`sinkboom`: splash, muffled boom, no blast damage) and is removed with its cargo. Sinking cars fade and bubble on the client.
  - Spawns use `CAR_SPAWN_BLOCK`; boats spawn on water (`BOAT_BLOCK`).
- **Swimming:**
  - Players can enter water (`SWIM_BLOCK`). `pedStep` swims at 42% speed with no sprint or roll; you can't attack while swimming, and you climb out anywhere.
  - NPCs in the water head for the nearest land (`nearestLand`).
  - Leaving a boat in open water drops you over the side.
  - Swimmers draw half-submerged with ripples.
- **Bridges:**
  - Bridge tiles are two layers: `s.under` is set when you enter from water and cleared on land, so swimmers and boats are *under* the deck while walkers and cars are on top. The swimming bit rides in the ped's `extra` byte (bit 7).
  - The renderer draws swimmers and boats, then re-draws the baked deck tiles over them, then land vehicles and peds. Your own boat or swimmer gets a faint dashed outline while underneath.
  - New bridge look: walkways, railings with posts, lamps, a side face and a cast shadow on the water, plus pier stubs.
- **World events (`server/systems/events.js`, `shared/worldevents.js`):**
  - Snatch-and-grab (orange, follows the thief), contraband drop (purple), and "return the purse" (green, shown to whoever holds a purse, pointing at the robbed victim).
  - Colour-coded pulsing radar and world-map blips.
  - A labelled arrow with distance around the player plus a ring on the spot. The arrow shows for 10 s from first sight, then fades, and doesn't come back for that event.
- **Flung from vehicles:**
  - `vehicles.fling()` covers bail-outs, high-speed carjacks and passenger ejections, bike crashes and explosions.
  - Airborne arc (`airUntil`, low friction; self flag 32 for prediction), then a random landing: roll, faceplant or slide on the back. Damage scales with speed.
  - The client animates the arc from a `fling` event: lift, scale, spin, ground shadow, dust puff and a thud on landing.
  - NPCs now fly and slide too (wall and car impacts hurt them).
  - Slow carjacks are just a short stumble.
- **Dev:** the debug menu sits at the top of the pause menu, and Give Weapons is first in it. New commands: `snatch` (trigger one nearby) and `die` (respawn test).
- **Tutorial v2:** new "Into the water" stop, and the event colours are explained. The tutorial tests now also require every world event type to be covered.

## Phone, job board, patrol calls, banking
- **Phone** (`client/phone.js`, overlay; P / D-pad ← / 📱 HUD button / pause menu; B or Esc steps back):
  - **Places:** nearest-first lists from the shared map: hospitals & police, banks & ATMs, shops, places to sell, cars & boats, work & law, gang HQs. Each entry shows what it's for, its district and distance; picking one sets a waypoint.
  - **Jobs:** the server board (`server/systems/phone.js`) keeps ~7 deliveries between storefronts, tiered by distance via `JOB_TIERS` in `shared/rules.js`: $ nearby / $$ across town / $$$ island to island, with pay and time limits scaling. It also lists the farm harvest and, for on-duty officers, 3 patrol calls. One job at a time; cancel from the phone. You can still start jobs in person at the warehouse and farm.
- **Waypoints:** job target (yellow) and phone waypoint (cyan) show as a minimap blip in range or an arrow on the radar rim when not, plus a marker on the world map and a small diamond on the spot. Phone waypoints clear on arrival.
  - Jobs guide you to the pickup first (crate not yet touched), then the drop-off (`phone.jobTarget`).
- **Patrol calls (police):** drive to the district → look around for `PATROL_SEARCH_S` (6–14 s) → a purse snatching is staged nearby, and the waypoint follows the suspect. Cuff the suspect or book the body for `PATROL_PAY` ($250–450) paid to the bank (`phone.onCriminalStopped` hooked into arrests and body booking). Escape or going off duty ends the patrol.
- **Banking:** a First Pixel Bank branch on each island that lacked one (converted storefront + ATM) and up to two street ATMs per district (3 banks, 15 ATMs on the default seed). Shop sales (items, weapons) and black-market sales now go straight to the bank.
- **Gang HQs:** a Syndicate HQ in each gang-turf district (`kind: 'gang'`).
- **Tutorial v3:** new "Your phone" and "Patrol calls" stops; gang HQs and bank-paid sales covered. The coverage tests flagged all of these until they were taught.

## Smoother driving and walking (round 2)
Measured with 4x CPU throttling (phone-like frame times). Before: driving speed wobbled 8–15% frame to frame and the car shifted up to 14 px on screen per frame; walking wobbled ~10%. After: driving 1–2%, car steady on screen; walking 0.4%.
- **Reconcile kept the render interpolation:** each snapshot used to reset `prev = current`, so the character drew a partial step ahead until the next fixed step, then snapped back. Replay now keeps `prev` = state before the last pending input, and the correction is measured on the *drawn* (interpolated) position.
- **Camera locked to the smoothed character:** the old chase lerp (`min(1, dt*8)`) made the lag depend on frame time, so the car slid around on screen on uneven frames. The look-ahead and zoom easing are now frame-rate independent (`1 - exp(-k dt)`).
- **World transform snapped to whole device pixels:** pixel-art ground and sprites no longer shimmer against each other.
- **Street-furniture smashes are predicted:** `shared/smash.js` (`smashProps`, `geyserDrag`) is used by both the server and the driver's client. The client applies the same momentum loss, marks the prop broken at once (instant debris), and predicts hydrant geysers. Replays treat a break or geyser from a later input as not-yet-happened, and unconfirmed predicted breaks are put back after 2 s. On the server, player-driven cars run the smash and spray checks once per input step. In a smash-heavy test drive (10 props incl. hydrants) the server/prediction divergence went from 173 px to 0.
- Remaining corrections only come from real contact with other moving vehicles or people.
