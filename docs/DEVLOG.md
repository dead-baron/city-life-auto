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
