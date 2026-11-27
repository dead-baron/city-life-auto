# City Life Auto - the pre-beta list (2026-11-17)

Everything that's open before the beta: the owner's notes (11-17's playtest and earlier), the earlier plans' unfinished
items (beta checklist 11-14, world craft pass 11-14/15, launch plan 11-03, decisions register), and the work sitting
unshipped on branches. The owner (11-17 21:36): "it feels like every system has issues and isn't finished and so many
notes I've given previously weren't applied across the world or weren't implemented yet" - so this is the beta's
gate, not an after-launch list. The big pass starts after the weekly reset (Friday 11-20).

## Where it stands (2026-11-23 morning) - the short version
Status from the DEVLOG and the branches; the sections below hold each item's detail. Done since 11-17 and not repeated
here: the pre-beta art and UI and batch 1 of the 11-22 notes (live 11-22), the new people, your music, the quick bar,
rooms lit at night, the console's Status tab (live 11-23).
1. **The world batch** (section A, `prebeta-world2`) - ready apart from the Old Downtown casino fronts (in hand); then
   your word to put it live (one re-bake, ~5 h - watch it on the Status tab). For Fable after it: lobbyDoor (done 11-26 on
   `fable-art-1124`: a door of its own for each flat over a shop, 0), signCovered, the ATM booths, roof billboards cut off, ATMs under awnings, the boardwalk bends, a taller neighbour drawn
   over a room you're in (the renderer), rail bridges.
2. **Server and loading** (F) - the art kept across restarts (check on the Status tab at the next restart: it should
   stay "Up to date"); phones drawing missing art themselves during a redraw (the stutter); a "Server updating"
   message on the title during a restart.
3. **Finish or hide** (D) - your call per item: the casino table games, car soccer, the raceway, tennis, kayak racing,
   the cinema.
4. **Systems** (C) - NPCs (off furniture and fountains, dancers spaced, no looping lean, animals out of step, bar
   fights), car headlights at night on the Neon Strip (the light cap), the kayak's paddling, the skateboard (carry it,
   hop on, one board), the Rusty Spur's pool table, car soccer's boost flame and art, racing markers and grids,
   traffic jams at busy junctions (the gridlock test), the character creator's "My looks" strip, desktop panels with
   CSS zoom, living city events, the portrait phone layout round the thumb map, phone wires that end at nothing, NPC
   drivers shown in open vehicles.
   - **DONE 11-27 (Opus; DEVLOG): the gridlock test passes** - both four-ways (one a car already in the box waited its
     turn behind one at its line it stood in the way of; passers-by in the road took turns holding a taxi). Still to look
     at: cars left driverless in the road by a chase or a mugging held a box truck in a lit box 41 s (seed 3 of
     `tools/gridlocksim.mjs`) - traffic should get round them, or they should be cleared.
5. **Branches to ship or drop** (E) - `neon2` (the Neon Strip's bigger rework), `inventory` (the inventory screen, the
   SNES font in menus), `ads` (the Employment Center), `director` (the Camera's clean screen), `fsrow` (Fullscreen
   at the top of Settings > Graphics), `founderpack` (held by you), the founder look mockups.
6. **World craft** (B) - waves 2-6, district by district (wave 1 done).
7. **The walkthrough** (G), then **the launch steps** (H).

## 2026-11-23 afternoon - done today, and the owner's new notes

**Live today:** the world batch (PR #25, re-bake follows); the Inventory (#19: character, clothes, underwear and socks, towels,
REMOVE ALL); the stash in the Inventory (#20); press and drag on every device (#21); the trunk (#22); tiles and slots
polish (#23); the quick bar a keyboard's only, the ellipsis, the touch ammo (#17, #18).

**The owner's notes still open (11-23):**
1. **Building transition** - going in or out darkens the whole screen for a moment. Wanted: the building's exterior and
   interior art cross-fade, nothing else on screen dims (not the old pop either). Pre-beta. (client/art2/game/host.js -
   the walk-in / roof fade.)
2. **Mouths (Fable 5.2, the art pass)** - the line reads too dark, and in the run cycle it jumps about the face or doesn't
   draw whole. Options: a softer, thinner line; a mouth only in the close-up; or none. Wanted: a check that a face's
   features hold their place across every frame of every cycle (a lint over the people renderer's frames), then decide.
3. **The stash's side-by-side screen** - waits for the UIC-21 concept (prompt: project claude/stash-concept-prompt-2026-11-23.md).
4. **The UI pass, every screen** - next: a harness that shoots the real game's screens (pause, settings, map, phone,
   shops, death) at four sizes, as the HUD and the Inventory were.

**Follow-ups found today:** two north-facing doors at Northshore Beaches under trees (visaudit; main's own picnic and cola
counts too); the street race's start (streetlife.js laneSpot: 60 random tries among ~9 streets on the Strip) fails now
and then - world3scenes flakes on main.

**The owner's 11-23 PDF (47 pages)** is triaged in `docs/tasks/PREBETA-NOTES-2026-11-23.md`: P1-P12 pre-beta fixes
(chunks vanishing first), C1-C4 cheap cinematic infrastructure, the Fable art list, after-beta events. The stash concept
UIC-21 is in (`docs/art-v2/targets/ui/UIC-21_stash.png`).

## 2026-11-24 morning - the owner's calls, done
- Finish or hide (D): the kayak races hidden; the rest kept (above). The page's code budget 540 -> 560 KB.
- The balance audit (BALANCE-2026-11-22.md): 1 pay unchanged until the test weekend's data; 3 the daily goals' second
  from the other road; 4 the first knock-down's line: carried cash drops, bank it.
- **For the Fable 5.2 chat, added:** the cinema's redesign (lobby + separate auditoriums - world and art); car soccer's
  arena art (branch `arenaart`); the races' markers and grid; tennis's swing (with the people pass).

## 2026-11-24 overnight (Opus) - done, on branch `smash-1123` (on top of PR #35's `heights-1123`; DEVLOG has each)
- Vehicles smash things (the owner's 11-23 20:10 note): fences go down at speed, what's knocked over lies there with
  its shards, sitters thrown.
- P2 part 1: driving fast, the art ahead downloaded first (6 at once on a phone). Still: the ~70 ms long tasks.
- P8 part 2a: racers never cross a median. Measured fine: the city's traffic (no median riding) and called taxis (8/8
  got there, nothing off the road). Still: the cinematics' scripted cars, jams.
- The UI pass (item 7): tools/uishots.py - every screen at four sizes with an audit. Fixed what it found: the hub's
  buttons blocked after a stalled arrival (a real bug on slow phones), cut-off look names, quick bar and job-pay labels,
  the Inventory's stat labels. The stash side by side on big screens (UIC-21).
- C, Night lights: headlights keep a quarter of the light cap. C, saved looks: the My looks strip (as agreed 11-17).
- D: a status table for the owner's finish-or-hide call (below).

## How we work through it
- **Every fix is a class fix**: fixed everywhere it occurs, with a lint row or test that runs over the WHOLE World v3
  map in `npm test`, so it can't come back. A note fixed in one spot only is not done.
- **World changes go in one batch** (one rebuild, one art redraw, ~4 h on the 4-core server): sections A + the world
  parts of C.
- **Server changes are batched** too (each push to server/ or shared/ restarts the game).
- **Finish or hide**: anything not finished by the beta is switched off for it (owner decides per item, section D).
- **Proof**: before/after shots for the owner's review; then a feature walkthrough (section G) before the beta opens.

## Sort order for Friday (first step: the owner marks each item fix / hide / after)
1. Section F (the art kept across restarts) - it decides whether every later push costs a 4-hour redraw.
2. Section E (ship or drop the branches) - finished work the owner thinks is in.
3. Section A (the world batch) + B (the craft waves) - one redraw.
4. Section C (systems and features) - server + page batches.
5. Section D decisions, G walkthrough, H launch steps.

## The owner's notes of 11-22 (his 15-page PDF; triaged 11-22 in the pre-beta chat - each note's ripple check and guard: `docs/tasks/PREBETA-NOTES-2026-11-22.md`)
Done 11-22 (on `prebeta-art`, live with its go-live): N1 the bag's tags, ammo and slots; N3 wanted less easily; N4 no city
bounty; N5/N19 overhead labels from the head; N6 no twins in a uniform; N8 the bag closes when you take something out;
N9 the gig screen's look (crisp pixel arrows - real songs wait for music); N11/N12 the event highlight on its person,
faded close up; N16 a door dip over the walk-in swap; N17 awnings see-through underfoot; N21 the respawn map's labels;
N22 the chat feed (4 lines desktop, 2 phone, yours too) and capped bubbles for long lines; A6/A7 Guide text; the
balance audit A1-A7 (`docs/audit/BALANCE-2026-11-22.md`).
Still open, by package:
- **World batch (A above)** - new rows: `roofSignCut` (N23, signs cut by their roof), `atmUnderAwning` (N18; the world
  data has no two ATM machines within 3 tiles - the pair he saw on a hospital is likely the front's own dressing: look at
  St. Neon General), `iconOverSign` (N20: a place's map badge over the door covers the awning's H - the badge goes over
  the door, the sign off it), `darkInterior` (N14: a walk-in with no lamp of its own is dark at night - lights belong to
  things), hospitals' signs one per front, lit (N20). Counts: 31 medical places (about 6 hospitals, 14 clinics, first-aid
  and ranger stations), 977 walk-ins, 385 ATMs.
- **Art on Fable** - N2 item icons toward the concepts and a UI/UX polish over every device and orientation; N20 the
  hospitals' and storefronts' design (a hospital reads as a hospital: entrance canopy, EMERGENCY, one green lit sign; the
  front's glow not washing out the name); see-through windows as a baked "lit room" layer in the window art (cheap) -
  live see-through is not for the beta; N15 the buskers' and the player's playing animations (on the beat).
- **Systems / UI** - N7 the quick bar in play (today: hold X / View / BAG for the wheel; an always-on strip is a new HUD
  element - the owner's call); N13 the four "robbers" in a hospital (likely four carriers of valuable crates - their marks
  follow them now; the calm-streets cap is 2 happenings within 900 px - to confirm in play); the HUD's second note on
  small sideways phones (pre-existing, `test/hudlayout.test.js`); the dashed diagonal on the big map is the subway's
  tunnel (answered).
- **Music (package 4)** - N9 real songs in the gig; N10 NPCs reacting and tipping, players tipping; N15 the playing
  animation on the beat - with the music clock.
- **Economy** - pay and prices unchanged; the audit's proposals 1, 3, 4 wait for the owner and the first test weekend's
  `/admin` money sources.

## A. The world batch (each with its world-wide lint row) - details below
- Sidewalks clear: no hedge, bush, tree or planter on a sidewalk, path, road or plaza (`plantOnWalk`) - AGAIN, 11-17.
- Entrances face south / SE / SW, never north (hospital, the Neon casino, ...) (`northDoor`).
- Interiors fit their building; nothing drawn over a room you're in (the casino) (`interiorOverlap`).
- Doors you can't go in / services at the wall (Egret Point's class fix on branch `egret`) (`wallOnly`, `doorOnGrass`).
- Shop fronts never on an apartment's lobby door (the 24-7 Market) ; fronts' names match their business (a pharmacy
  under "Neon Nights") (`frontNames`).
- Signs never covered (OPEN under an awning, the ATM over a sign) (`signCovered`); no drink-driving sign lines.
- Freeway on-ramp at ground level across a street (`rampCrossesRoad`).
- Railings / fences out over the water on diagonal shores (`railOverWater`).
- Docks / boardwalks / piers overlapping themselves (the Egret Marsh boardwalk) (`dockOverlap`); water creeping up
  beside docks; a "Jump in" at a dock's edge.
- Rail bridges over water: real bridge art (`railOverWaterArt`); tunnel portals set into a hill, trains going in
  (`portalOnFlat`).
- Bistro lights: a few strands, not a curtain (the Neon alley) (`festoonDensity`).
- Stray crop fields in towns and on beach lots.
- Helicopters only on helipads; a helipad for the hospital.
- Beached boats usable or clearly stored (`deadBoat`).
- The cinema redesign (lobby + separate auditoriums).
- Water sparkle flicker; koi drawn under the water.

## B. The world craft pass - waves 2 to 6 (the 11-14/15 plan; only wave 1 is done)
Wave 1 done 11-15 (Neon Strip + Pink Mile, Downtown/Greenfield Park, Midtown); the Neon Strip's pass 3 is on branch
`neon2` and needs the bigger rework. Still to do, each with the plan's checklist (concepts read first, past feedback
carried, no oversized empty spaces, visible streets and alleys, lights that belong to things, props in groups that tell
a story, NPC life per district, checked at noon/sunset/night, the owner's review):
- Wave 2: Harbor + Old Town, Westport Center + Old Quarter, Arts District.
- Wave 3: Bayside Heights, Sunset Beach + Pelican Key, Lucky Mesa.
- Wave 4: Northgate, Civic Center, Southside + Pine Hills.
- Wave 5: the towns (Northshore, Sandpiper Bay, Copper Gulch, Willow Crossing, Timber Bend...), Gull Harbor / Coral
  Cay, Cedar Isle, Egret Point.
- Wave 6: the countryside and wilds (lighter).
- Streets and alleys visible world-wide (nothing over walkable/drivable ground; alleys a car wide, dressed).

## C. Systems and features that aren't right yet
- **NPCs**: never on furniture, in fountains or on game areas while a game runs (pool table, tennis court...); dancers
  spaced; no looping lean on sidewalks; animals/birds not in lockstep; staggered bar-fight reactions with bikers
  chasing.
- **Shadows**: one rule for anything in the air (tennis ball, jumping fish, seaplane, birds) - a small soft shadow.
- **Night lights**: car headlights lost to the 96-light cap on the Neon Strip - vehicles get a reserved share.
- **Rider jitter / sound crackle** after the speed fix - recheck now the redraw is done.
- **Kayak**: sit in it, paddle strokes and the paddling feel (a stand-up paddleboard optional).
- **Skateboard**: carry it off rough ground and hop back on; remove the stand-in "thrown board"; one story for a snap.
- **Tennis**: rackets in hand with a swing.
- **Pool (Rusty Spur)**: pixel balls, the banner off the table, balls/cards drawn on the table, the camera frozen.
- **Casino and card tables**: real table minigames with players and NPCs seated (blackjack, roulette, poker) - or
  hidden for the beta.
- **Car soccer**: the boost flame (small); the SNES art pass (ball, pads, goals, scoreboard). Replay removed 11-17.
- **Racing**: markers that belong (not floating cones); race grids spaced; better tracks (offroad, street, water),
  street and long-distance races - design first; for the beta at least the current track's markers and grid.
- **Camera / director**: full camera moves, "next scene"; shots of NPCs playing games; cinematic sound follows the
  camera.
- **Hospital lobby music** (done 11-17, check); the cinema without lobby music (done 11-17).
- **Character creator, saved looks** (owner 11-17 23:06-23:09, shot attachments/25f112d0-image.png): "Add to Saved"
  doesn't say where your saved looks are, and saving isn't how you'd look for them. Agreed design: a "My looks" strip
  right under the preview, always visible on every tab - your saved looks as small portraits (tap one to wear it;
  hold / a small menu to rename or delete) and a "+" tile at its end that saves the current look (name it in place).
  Browsing = the strip, saving = the +; the "Add to Saved" footer button and the Saved tab go (footer: Random, Undo,
  Done). Empty strip: just the + with "Save looks here".
- **Desktop panels with CSS zoom**: no broken clicks in any canvas inside them (respawn map fixed 11-17).
- **From the 11-14 beta checklist, still open**: living city events (races and chases through alleys, crashed
  criminals bailing out, gang turf shootouts, police raids); the mobile portrait layout reworked round the thumb map
  (owner approval); phone wires that end at nothing; NPC drivers shown in open vehicles; the character polish pass
  (nice to have before trailers).
- **Inventory** (branch `inventory`): finish it - the inventory screen findable again, the SNES font across every menu.

## D. Finish or hide for the beta (owner's call per item)
Casino/card tables, car soccer, the raceway, tennis, kayak racing, the cinema, Practice Offline (already hidden),
anything else the walkthrough finds unfinished. Hidden = no map marker, no door, no Guide entry until it's done.

**Decided 11-24 08:44 (the owner: "Lets Agreed on your suggestions"; DECISIONS "Product and launch"):** as suggested
below - the kayak races are hidden (shared/hidden.js); car soccer's arena art, the races' markers and grid and tennis's
swing go to the Fable pass; and **the cinema is redesigned before the beta** (a lobby and separate auditoriums), in the
Fable chat's world-art work. The table as it stood:
| Item | Plays today | Missing (section C) | Claude's suggestion |
|---|---|---|---|
| Casino floors and card tables | Slots, roulette, blackjack, video poker and the race book against the house; NPC regulars seated, the wheel spinning and cards dealt for everyone near (casinofloor.js, 11-14) | The fancy-tier art and the table games' look (art); poker with other players | Keep - it plays end to end; the art goes in the Fable pass |
| Car soccer | Lobby, teams filled by NPC drivers, the ball, goals, kick-off (no replay since 11-17) | The boost flame; the SNES art pass for ball, pads, goals, scoreboard (branch `arenaart`, paused) | Keep if the arena art makes the Fable list; else hide until it does |
| The raceway (Westport oval) and the water races | Three laps for anything with wheels; a jetski sprint and a boat classic at Pelican Key; join at the start, checkpoints, forfeits | Markers that belong (not floating cones), the grid, better tracks (design first) | Keep the races; the markers are art - put them on the Fable list |
| Tennis | A game against the club pro on any court: serve, rallies, tennis scoring | Rackets in hand with a swing (art and animation) | Keep - the swing is the people pass |
| Kayak racing | The Redwood River Run: gates down the river, kayaks hired at its dock (races.js, world3-riverrun.js); the MX park's dirt laps too | Sitting in it, paddle strokes (C: Kayak) | Hide the race until the paddling's done; keep kayaks to ride |
| The cinema (Grand Theatre) | Tickets, seats, films on the screen, NPCs watching (no lobby music since 11-17) | The owner's redesign (section "The cinema", 11-17) | Owner's call: keep as is for the beta, redesign after |


## E. Unshipped work on branches (all backed up to GitHub 11-17) - ship or drop
- `egret` (+8): Egret Point interiors, paths to the doors, signs clear, the wallOnly/doorOnGrass/signCovered rows.
- `neon2` (+7): Neon Strip pass 3 - needs the bigger rework the owner asked for.
- `inventory` (+12): the inventory screen and instruments; the SNES font in menus.
- `ads` (+7): the Employment Center.
- `director` (+1): the Camera's clean screen (most of it already live).
- `founderpack` (+3): the Founder's Pack (built, off - the owner holds it until there are enough testers).
- `fsrow` (+1): Fullscreen as a switch at the top of Settings > Graphics.
- `admin`: founder look mockups (scratchpad/admin/mock) - the owner preferred mockup 2, smaller and less goofy.

## F. Server and loading
- **The art thrown away on a restart?** The redraw had finished (45,864/45,864) at 16:09 on 11-17, then after the
  evening's restarts it was at 17,652 - find why (the server log: `journalctl -u city-life-auto | grep '\[art\]'`)
  and fix, so a push doesn't cost players hours of blurry, stuttering art.
- **Phones draw missing art themselves** (the stutter): during a redraw they should wait for the server's chunk and
  show the low-detail picture.
- The 4-core / 24 GB server is live (11-17): check the stats show 3 bake threads.
- Faster restarts by saving the built world; art baking on GitHub's runners (later).
- A "Server updating" message on the title during a restart.

## G. The feature walkthrough (before the beta, after A-E)
A written checklist per system (driving, walking/combat, police/wanted, jobs, shops/wardrobe, the character creator,
homes, fishing, transit (train, bus, taxi, ferry), boats, aircraft, each activity, the phone and Guide, chat/emotes,
the death screen, sign-in and accounts, settings, mobile controls) played through on desktop and phone; every failure
becomes an item here.

## H. Launch steps (on the owner's word "launch the beta")
Profiles wiped (PROGRESS_EPOCH bump), the open debug mode off (the director stays the owner's), the age gate on, the
sign-in "Loading..." fix, a full test run, the world map picture rebuilt, a bot load test, push at a quiet time; then a
feature freeze. Owner side: AdSense review -> the EU consent message and the H5 Games application; the itch page goes
public; trailers recorded once the world batch is in.

## I. After the beta (ideas kept, not for now)
Multiple cities (100 players each); the racing expansion beyond the basics; the Founder's Pack on sale; a stand-up
paddleboard; treasure hunting; VR arcade games; the admin angel arrival; biker groups; a lawyer's review before money
changes hands; Android/iOS/Steam later.

---

# Owner-reported 11-17 (the details: what he saw, the screenshot, the fix and its world-wide check) - the "fixed everywhere, with a world-wide check" pass
- Water surface sparkle glistening rapidly (Harbor Marina) - the surface glints themselves, not fish.
- Water creeping up beside docks / boardwalk where it meets the sand.
- Street race cars spawn too close together.
- Trees/vegetation chunk vanishes when a vehicle hits a tree (chunk re-bake shows the stand-in).
- Dancers bunched up, one standing in a fountain; NPC on the pool table - shared rule: people spaced, never on furniture or in water.
- OPEN sign half under an awning (sign-covered check).
- Hospital/clinic with its entrance on the north wall - check every business door on a north wall.
- Cinematic sound: ambience follows the player, not the camera.
- Koi fish drawn above the water, not under it.
- Jumping fish cast a long shadow (like birds used to) - shadow should be small, under the fish, on the water.
- Birds/animals doubled up: two moving in lockstep, same speed and timing - vary phase, speed and offset per individual.
- Helipad at the hospital; every parked helicopter on a helipad.
- Camera shots: full camera moves, "next scene"; pool players actually playing; shots for every NPC game.
- Car headlights/tail lights missing at night on the Neon Strip (likely the 96-light cap: neon outranks headlights; engine.js _packLights scores by intensity x radius) - give vehicles' lamps a reserved share; check headlights elsewhere at night.
- Rider vibrates on a scooter/vehicle, sounds crackle (11-17 13:03, after the speed fix went live). Server: load 2.8 on 2 cores while the art redraw runs (2 bake threads). Recheck after the redraw finishes; if it persists, suspect the speed fix's per-tick corked write (net.js sendTo cork/uncork) first, then the client.
- Signs/names swapped: a pharmacy/clinic (green + marker) under a 'Neon Nights' board (Downtown/Midtown block with Live DJ, Beer Wine Spirits, Volt). Check the fronts' names (frontNames/sameName lint) vs their POIs.
- Doors that open as you walk up but you can't go in (Egret's 'wallOnly' class - the walk-in rooms list; ship egret's class fix and check its long tail).
- Shop fronts on apartment buildings keep the apartment's lobby door: the 24-7 Market's door says 'Into Southside Apt #3173's lobby' (World v3 storefronts taken over on residential buildings - a lint row: a business front's door point never a home/lobby POI; move the lobby to a side/back door).
## The Rusty Spur (owner, 11-17 13:38)
- Pool: the shot message banner covers the table - move it above/below the table or make it a small fading line.
- Pool balls look like placeholders - redraw as SNES pixel balls (numbers, stripes, shading, a cue ball).
- An NPC walks into the middle of the pool table (same rule: people never on furniture).
- Pool: the world camera drifts behind the table while you aim - freeze the camera while the pool game is open (others still see you walk round the table).
- The "RIDE DRINK REPEAT" sign reads as drink-driving - replace with another biker-bar line (e.g. "RIDE FREE", "IRON & ASPHALT", "LIVE TO RIDE"). Check other signs for the same.
- The card table opens a "Video Poker" menu, not a table game - it should be a real poker/blackjack table minigame with the other players/NPCs seated, as discussed; the bar's machine can stay video poker.
- Bar fight reaction: stagger it - the first patrons come out and yell, then fight; others join a few at a time, not all at once. When you run, some grab their motorcycles and chase.
- Pool balls and the card table's cards float over the scene instead of sitting on the table: draw them in the table's own world space (anchored to the table's position, moving with the camera, under people's heads / over the felt), not as a screen overlay.
- Docks: you can't walk off a dock/pier into the water - deliberate (owner's b1c bug: falling through bridges); a dive roll does jump in, but nobody knows. Make it discoverable: an 'Jump in' prompt at a dock's edge (or walking off a low dock's open end/sides works, bridges keep their railing), plus a Guide line. Keep bridges railed.
- Seaplane wing shadow looks wrong (the long-shadow glitch seen on fish/birds/planes) - one shadow rule for everything in the air or jumping: a soft shadow under it on the ground/water, offset by height, never stretched.
## The cinema (owner, 11-17 13:53) - a redesign
- A huge empty red-carpet lobby and a thin strip for the auditorium, which reads as one room with two screens. Redesign: a compact lobby (ticket counter, concessions with popcorn/soda, posters, a queue rope, a couple of benches), two or more separate auditoriums behind doors, each its own room with its screen at the far end, raked seat rows facing it, an aisle, dim lighting; the film plays on the screen. Fill the lobby with dressing; no big empty floor (same "no big open spaces" rule).
- Lobby music: none in the cinema - the auditoriums play the film's sound (or quiet), the lobby a soft murmur / concessions sounds. Today's music.js plays 'lobby' there (the bossa nova went to the bank, courthouse and cinema): take the cinema out of it.
- Stray crop patches in towns and by beaches: a flat yellow wheat field (with the car's skid marks on it) and a vegetable bed on the empty lots of a beach road (11-17 16:15). The countryside's fields fill open ground they shouldn't (town lots, beachfront, roadsides). A lint row: a field only on farmland (a farm's yard or the countryside's field zone), never in a town or within N tiles of a beach/promenade; turn those lots into proper town dressing (a lot, a park, dunes).
## World info belongs in the world (owner, 11-17 16:18) - a class fix
- Station/stop info ("NEXT TRAIN - BOARDING", bus stop times) pops up as a floating web-style box over the scene; bus stop signs were glitched tiny. Build it into the world: a departures board / LED sign on a post or the station canopy at every stop (pixel-art, lit at night), its text drawn in the game's pixel font, updated live.
- Trains and buses: their destination / next stop on the vehicle itself - a destination blind on the front and sides, part of the vehicle's sprite, not a label that follows it.
- The green dashed boxes / arrows (boarding zones), and the markers on events (a robbery, a lost pet, etc.): redraw in the SNES style - pixel-art ground marks (painted lines, a chevron decal) and a small pixel icon, no web-style rounded boxes or flat translucent overlays. One style guide for all world markers.
- Audit every floating world label / marker on the page (client side) and list which become world signs, which become SNES-style markers.

## On-ramp across a city street (owner, 11-17 20:20; shot: attachments/7972ea69-image.png)
A freeway on-ramp curves down from the elevated highway at street level, straight across a 4-lane avenue (a raised
embankment wall over the lanes); cars on the avenue drive through it. Fix: the ramp is a bridge over the street
(cars pass under, its shadow on the road) or it lands before the street and joins it at a junction. Class fix,
world-wide: lint row `rampCrossesRoad` (a ramp / highway piece at ground level over a road tile that isn't its own
junction), fix every hit. A world change = a full art redraw (~4 h): batch it with the other world fixes.

## Sidewalk pair rocking back and forth (owner, 11-17 20:21, "still weird"; shot: attachments/5ebc24c9-image.png)
Two NPCs pressed together by a door on a city sidewalk (outside a walk-up next to "Ropewalk"), looping one lean
forward-and-back forever. Probably the couples' slow dance (shared/dance.js) or a sit pose with no seat, used out of
place. Fix: find what puts them there; a sidewalk pair chats / walks on instead (a dance only on a dance floor, a sit
only on a seat); vary or end the loop. Lint/test row: no dance or sit move outside its place. Client + server
behavior only: no world change, no redraw.

## Promenade railings sticking out over the water (owner, 11-17 20:28, "looks bad, we shouldnt have that"; shot: attachments/ba493ad8-image.png)
Along a diagonal shoreline promenade (night, palms, lamps), the railing is short horizontal pieces that jut straight
out over the water at each step of the shore. Fix: a railing follows the edge it guards - a stepped / diagonal run
that hugs the shoreline (or a low sea wall), never a straight piece out over the water. Class fix, world-wide: lint
row `railOverWater` (a fence / railing tile whose span leaves the land), fix every hit. Art/world change: batch with
the other world fixes (one redraw).

## Hedges / bushes on the sidewalk - AGAIN (owner, 11-17 20:56, "still spawning over sidewalks"; shot: attachments/d2f078cf-image.png)
A park-edge hedge block juts from the grass out across the whole sidewalk (a city avenue by a park, daytime) -
pedestrians would walk through it. Reported before and thought fixed: find which placer puts it there (park edge
hedges / planters / nature dressing) and why the earlier check missed it. Class fix, world-wide: lint row
`plantOnWalk` - no hedge, bush, tree trunk or planter on a sidewalk, path, road or plaza tile (any part of its
footprint), run on the WHOLE World v3 map and in npm test so it can't come back; fix every hit. World change: batch.

## Car soccer: placeholder art, no boost flame (owner, 11-17 21:04; shot: attachments/247bea86-image.png)
Placeholder look: a smooth shaded white ball (not pixel art), plain yellow ellipse boost pads, a flat blue grid for
the goal (no posts / frame), a thin scoreboard. Holding BOOST shows nothing behind the car. Fix (client-drawn, no
world redraw): (1) the boost - a pooled pixel flame + spark trail from the exhaust while boosting, sized by speed;
(2) SNES pass - a pixel soccer ball with a spin frame and shadow, boost pads as glowing pixel discs that dim when
used, goals with posts, crossbar and a net, a chunky scoreboard in the HUD's font. Owner: post-beta unless cheap.

## Casino interior covered by the next building (owner, 11-17 21:07, "looks really weird"; shot: attachments/9c7c9a4a-image.png)
Inside a casino (Neon Strip, night; roulette, card tables, slots), the south two thirds of the room is covered by
another building's facade - rows of lit windows and its walls drawn over the casino floor; the player stands under
it. The interior is bigger than its building and runs into the neighbour (or the neighbour is placed over it), and
the cutaway only opens the casino's own roof. Fix: the interior fits inside its building's footprint (or the
neighbour moves), and the cutaway opens everything over the room you're in. Class fix, world-wide: lint row
`interiorOverlap` - an interior's floor under any other building's footprint/facade; fix every hit. World change: batch.

## Same casino: entered from the north; too many bistro lights in the alley (owner, 11-17 21:08; shot: attachments/9cc50ee9-image.png)
- The casino's door is on its north wall (you walk in from the back alley / plaza above). The rule (see "north-facing
  doors" above): entrances face south, or a SW / SE corner entrance. Move this one; the `northDoor` lint row covers
  the rest of the world. Fix it together with the casino's interior overlap (one rebuild of that block).
- The plaza / alley north of it (Neon Strip) is hung with a dense grid of bistro-light strands - a dozen-plus drops
  between every pair of poles, all over the paving: too many, looks bad. Thin it: a few strands crossing the space
  (pole to pole or building to building, a gentle sag), not a curtain; a cap per area in the festoon placer
  (shared/world3-neon*, festoons) and a lint row `festoonDensity`.

## Casino table games as real minigames (owner, 11-17 21:10; shots: attachments/b0563d68-image.png, 9e67cbd3-image.png)
Wagon Wheel Casino's Blackjack and Roulette (and every casino's / bar's table games) are only list menus (Deal / Stake
/ BUY rows). They should be minigames played AT the table, in the world: you sit down, the camera settles on the
table, the cards are dealt onto the felt / the wheel spins and the ball drops, chips go down on the layout - and the
other players and NPCs seated at the same table play their hands / place their bets where you can see them. Same
look as the pool table (cards and chips in the table's own space, not floating - see the Rusty Spur item above,
which this covers too: its card table becomes the same poker/blackjack table). Rules, odds and payouts stay on the
server (as now); the page draws the table. Order: blackjack, roulette, then poker; slots/video poker can stay
machines. A big piece (several sessions) - after the world batch.

## Tennis (owner, 11-17 21:18; shot: attachments/a009f788-image.png)
- The ball's shadow is a long streak across the court (from the ball near the net, far across). Same bug as the
  jumping fish's and the seaplane's long shadows above: an object in the air gets its shadow stretched by its height
  along the sun. Class fix in ONE place (the shadow of anything airborne - ball, fish, plane, bird, thrown item): a
  small soft oval right under it on the ground, offset a little by the sun and shrinking/fading with height, never a
  streak; a test row for the shadow length of a high object.
- Players (you, the pro, NPCs) hold no racket: add a pixel racket in hand while on court, with a swing frame on a hit.
- NPCs walk across the court during a game (a group stands on the baseline). Class fix: any area where a game is
  being played (tennis, basketball, car soccer pitch, pool table, golf green, etc.) is closed to NPC walkers and
  idlers while it's in use - their paths route around it, spectators stand outside the lines; a test row.

## Racing: real tracks and races across the world (owner, 11-17 21:22, "postlaunch stuff to fix and consider"; shot: attachments/e21ff3c0-image.png)
Today: the raceway is a plain dirt oval; its checkpoints are numbered traffic cones that look pasted on - floating,
no shadow or light, not part of the place.
- Checkpoint markers that belong where they are: on a dirt/offroad track tire walls, hay bales, flag poles, banners on
  posts; on streets barriers, arches, gantries, painted lines; on water buoys. Grounded, shadowed, lit at night.
- Several purpose-built tracks, there's room in the countryside: an offroad circuit (jumps, mud, a creek crossing,
  hairpins), a street circuit, a boat course on the water, a kart/short track; each with a start grid (spaced - see the
  race-grid item above), a finish arch and stands.
- Street races through the city and the world: point-to-point sprints across town, long-distance runs between towns
  (a coast road, the mountain pass), checkpoint races, drag races; open to cars, bikes, boats where they fit.
- Different ways to race: time trials with a leaderboard, head-to-head vs players, pink-slip / wager races (server
  rules), NPC racers to fill a grid.
Design first (a plan with the owner), then build. World change for the tracks: batch.

## Kayak; the marsh boardwalk crossing itself (owner, 11-17 21:24; shot: attachments/74518360-image.png)
- Kayak (River Kayak, Egret Marsh Paddle race): the rider STANDS on it and it drives like a motorboat. A kayak: you
  sit in it (lower body hidden in the cockpit), a double-bladed paddle that strokes left/right in time; it moves by
  strokes - a surge per stroke, glide between, slow to turn (stroke one side), drifts, no engine sound (paddle
  splashes). Vehicles' handling and the rider's pose by kind (server physics + page pose). Optional later: a
  stand-up paddleboard as its own vehicle (standing, single paddle).
- The marsh boardwalk (by the kayak start, Egret Marsh) overlaps itself: two runs cross on top of each other at the
  bend, a jetty pokes through the walkway. Fix: one walkway with a proper corner/landing, the jetty joining it.
  Class fix: lint row `dockOverlap` (boardwalk / dock / pier pieces overlapping each other outside a designed
  junction), world-wide. World change: batch.

## Skateboard stranded on grass (owner, 11-17 21:26; shot: attachments/082ec6a8-image.png)
**DONE 11-27 (Opus; DEVLOG):** stepped off rough ground with the board in your hand; Act picks up a board nobody owns on
the rough; back on smooth ground the vehicle button. The bail's stand-in board is gone (the real one skids off; a snapped
one breaks where it stops - the "it doesn't fly apart" story, no debris art). Not done: the scooter / e-bike (no such
small carried ride yet).
Ride a skateboard off the pavement onto grass and it stops; you can't pick it up - "can't ride on rough ground" - so
the board is left stranded. Fix: on rough ground the rider steps off holding the board (or Act picks it up from the
ground), carries it (board in hand / under the arm, walking speed), and on a smooth surface Act or the vehicle button
drops it and hops back on. Same for anything small and carried (scooter, e-bike if it fits). Server rule
(vehicles / players) + the carry pose on the page; a test row: board onto grass -> carried -> back on pavement -> riding.

## Beached boats you can't use (owner, 11-17 21:27; shot: attachments/005eb478-image.png)
Small wooden boats/canoes pulled up on the shore along a cobbled waterfront (and others around) are scenery: you can't
get in. Fix: every boat that looks usable is usable - a beached canoe/rowboat is a real vehicle (get in, push off,
paddle - with the kayak's paddling), or it's clearly not (upturned on racks, on a trailer, chained to a post).
Class fix: lint row `deadBoat` - a boat prop where a player could reach it that isn't a vehicle and isn't marked as
stored. World/props + vehicles: batch.

## Rail bridges over water need real art (owner, 11-17 21:28; shot: attachments/8fc1a405-image.png)
Where the railway crosses the water (two diagonal tracks off the waterfront), it's the ground track drawn over the sea
with brown curved "girder" stripes - doesn't read as a bridge. Draw a proper rail bridge: a deck with ties and rails,
side girders or trusses (steel, riveted) or a stone viaduct with arches by setting, piers down into the water with
their shadow and a little wake/foam ring at the waterline, the bridge's shadow on the water, an abutment where it
meets the shore (the ballast and the track run onto it). Diagonal runs drawn as clean as straight ones. Class: every
rail-over-water span uses the bridge art (lint row `railOverWaterArt`). Art change: batch with the world redraw.

## Rail tunnel portals (owner, 11-17 21:29; shot: attachments/533a03a7-image.png)
By the waterfront the two tracks end at two small white frames with a flat black doorway, standing on open grass; a
train drives through the frame and vanishes on the other side - it never goes INTO anything. Fix: a portal set into
real ground - a hill / embankment or a cut with retaining walls rising to it, a stone or concrete portal face with
wing walls, the track running into the dark, and the hill or the covered-over ground continuing beyond (grass, trees
on top) so there's no "other side" to see. The train is hidden by the portal's mouth as it enters (drawn under the
portal's top and the ground over the tunnel, clipped to the opening), and comes out of the far portal the same way.
Class: every tunnel end (rail, road) gets the portal-in-a-hill art and the clip; lint row `portalOnFlat`. Batch.

## Skateboard crash: a tiny placeholder board, then a different board (owner, 11-17 21:32; shot: attachments/71563f85-image.png)
Crash a skateboard into traffic: "The board snapped in two" + a red "SNAPPED!" in the world, and a tiny pale
placeholder board (a few pixels, light blue) flies out by the player - then the board you can pick up again is a
different, full-size one. UPDATE (owner 21:34): the tiny board flies out on EVERY bail, before any snap, while the real board rolls away - so it's
a stand-in "thrown board" effect on every crash, not the snap. Remove it: the real board is the only one. Then for the snap,
pick one story and draw it with the real board art: either the board snaps (two halves of
THE board's own sprite fly off and stay as debris; no pick-up, a new board from the shop) or it doesn't (the real
board skids away and is the one you grab). Same check for any vehicle's crash debris using stand-in art.
Page (crash fx) + server (does a snap destroy it); fold into the skateboard carry fix above.

## Desktop panels scaled with CSS zoom: check every canvas/pointer use (from the respawn map fix, 11-17)
The respawn map ignored clicks on a desktop because #d-panel has CSS zoom (style.css --zk) and Chrome's offsetX/Y are
off inside a zoomed box (fixed: deathscreen.js mapInput reads the pointer from the canvas's box). The same zoom is on
#menu .panel, .hub-frame (not the map tab), .jc-pop: check any canvas or offsetX use inside them; lint row
`offsetInZoom` (no offsetX/Y in code that runs inside a zoomed panel).

## Vehicles smash things, with a visible reaction (owner, 11-23 20:10 - for the pre-beta)
His words: "Can we have cars/vehicles actually knock over or break down or smash through the fence/chain link
fences/wooden fences if they drive through it? Also have trees fall over or bus stops or benches get knocked over or
shatter or break apart when they get hit hard enough with a vehicle? Anything that a vehicle can knock over or drive
through or destroy should have a visible reaction not just disappear (I've noticed a lot of things will just disappear if
you hit it with a car like benches and bus stops and stuff.) If an NPC or player is sitting on an object, like a bench or
bus stop, then they should go flying off while the bench or object they're on gets destroyed by the vehicle."
- Mechanics (Opus, after P8): a fence panel hit above a speed falls flat or breaks (its line opens there, kept so for the
  session; the car slowed); a tree knocked over above a bigger speed; benches, bus shelters, bins, planters, signs: a
  break event with pieces (pooled debris, server-told), never a plain vanish; anyone sat on it thrown (the ragdoll /
  knock-down the player already has). One table of what breaks at what speed in `shared/rules.js`. Test: every
  breakable prop kind has a reaction; a sitter is thrown.
- Art (Fable): the fallen / broken pictures of each (a flattened fence panel, a fallen trunk, a broken bench, shelter glass).

## Weapons and markers (owner, 11-23 21:37-21:39 - for the pre-beta, "when the time is right")
- **Aiming (keyboard and mouse):** "when you have it equipped it will always point out straight in your hand. You used to
  only hold up the weapon when you were aiming ... hold right click and that's when you would aim and put your weapon up,
  or hold right click to block if you were unarmed or had a melee weapon. Now it just seems like your gun is held up
  whenever you have it equipped ... the gun still comes down when I use controller." To do: find what changed on mouse
  and keyboard (the pose follows the cursor's aim while equipped?); the gun down unless the aim button (right click) is
  held, as on a pad; right click held unarmed / melee: block. A test row: equipped and not aiming -> gun down, on every device.
- **Muzzle flash at the barrel:** "gun shot flashes aren't coming from the barrel of the gun, they are coming from the
  middle of my character ... showing on the end of barrels for all weapons." The flash (and the tracer's start) at each
  weapon's muzzle point, by facing and pose; a test over every weapon.
- **The "!" over people:** "when an exclamation mark shows up on my character or other characters or NPCs ... slightly
  above the player model instead of over the player." One head-top anchor (the N5 overhead-label rule of 11-22): the
  mark clear above the head; test row with the labels.
- **The white rectangles everywhere:** not the cash machines (the owner, 21:51: "there was an ATM on the wall right
  next to it") - most likely the phone boxes (`phonebox`, the nightlife, Southside and red-light districts' street
  furniture, shared/map.js), their picture from the 11-22 art pass reading as a plain white and blue box. For the Fable
  art pass: a phone box that reads as one (the handset, glass, a PHONE sign). To confirm in the game: he'll send the
  district of one that doesn't fit.

## Found by the Fable art pass (11-24) - not art, not touched
- `test/world3wild.test.js` fails: "the tracks flagged notraffic (24; others: Northshore Station Road, Lucky Mesa
  Station Road, ...)" - the stations' roads count as tracks there. It fails the same on branch `fable-art-1124` before
  its world change (commit bef7671), so it comes from the world batch, not the art. Not checked on `main` itself.
- Cars jammed nose to tail on Coral Cay's jungle track (seen twice in the water recorder's films of the rainforest).

## Vehicles in shallow water (owner, 11-24 21:40 - noted for the pre-beta; a game rule, not art)
"I've noticed that when vehicles hit water they instantly sink ... it would be a better experience if vehicles can hit
shallow water and manage to move a bit in the shallow water before breaking down, or going into deeper water and then
sinking beyond any return, or just splashing a bit in very shallow water but it doesn't slow them down a bit ... it
shouldn't just instantly sink in any depth of water and lose your vehicle. So if we do have these natural bridges
across paths I dont want vehicles (especially offroad vehicles) to instantly sink and become un-usable."
To build (server physics, with a splash on the page): depth bands from the water's own depth (the art already has
one: client/art2/water.js depthOf; the server needs its own from tiles - distance to the bank, creek / pool / lake) -
very shallow: splashes, no slowing; shallow: slowed, a spray, the engine holds for a while and stalls if it stays in,
restartable out of the water; deep: sinks, as now. Off-road vehicles ford deeper than road cars. A creek's stepping
stones and log crossings (bridge tiles) are walked, not driven: a car meets the creek beside them - so a woods creek
(shared/world3-creeks.js) must be fordable by this rule before the creek network goes live. Guide entry and a
first-time moment with it (CLAUDE.md "teach the new thing").

## Keep the development project private; publish only what a player needs (owner, 11-24 23:40 - before marketing)
The owner asked whether to do anything, before posting and bringing in a beta crowd, to make the game harder to clone
(a note from another assistant he had look at the site). Checked in the code on 11-24 (not tested against the live site):
- The repository `dead-baron/city-life-auto` is public: the server, the tools, every design and decision document, the
  concepts and the unreleased branches can be downloaded by anyone. There is no project license (only the fonts',
  icons' and prompt glyphs' own).
- The game server sends its own source to any browser: `server/index.js` `STATIC_ROOTS = ['client/', 'shared/',
  'assets/', 'server/']` (all of `server/` but `server/config*`, `server/auth*` and `chatwords.json`), kept for the
  offline practice worker - which is switched off (CLAUDE.md "Offline practice is paused").
- No secrets were found tracked: `server/config.js` reads them from the environment or `data/secret.key`, and `data/`
  is ignored. Not a full audit - the history was not searched.
- `docs/` (DECISIONS, the handover, the plans) is public with the repo; GitHub Pages serves the page from the repo
  root (docs/DEPLOY.md), and the Oracle updater pulls `main` from it.
To do, in this order (each step tested before the next):
1. Stop serving `server/` to browsers (and leave the practice worker out) - with a test that no `/server/...` path
   answers. `shared/` stays: the page needs the map's runtime; consider serving only the runtime files.
2. A player-only build: a folder (or a small public repo) with exactly what the page loads - index.html, version.json,
   `client/`, the `shared/` runtime, `assets/` - made by a script, with a test listing what may be in it. GitHub
   Pages (or the Oracle server itself) publishes that, not the development repo.
3. Give the Oracle updater read access to the private repo (a deploy key), check a deploy and a rollback.
4. Then make the development repo private. On GitHub Free that unpublishes its Pages site, so step 2 comes first.
   Copies and forks made before stay public.
5. A copyright line on the page and in the build; the owner to decide on a license text with a lawyer if he wants
   one (not a decision for Claude).
What this cannot do: a browser game must send its page code and its art to players, so those can always be copied;
ideas and mechanics are free to imitate. What it keeps private: the authoritative simulation, the world generator,
the tools, the plans and everything unreleased.

## The owner's notes while playing the live build (11-25 00:22 - 00:33) - logged, not acted on in the art pass
- **DIAGNOSED 11-26 (Opus; DEVLOG):** not the world or the server - the page shows you as a silhouette on the shop's roof
  between stepping onto the doorway's floor tiles and the cut-away inside being ready; for the renderer's work.
- **A hop at a shop's doorway** (the gun shop / hardware pair, a walk-in front): "it looks like i have to jump across
  something underneath the doorway here, my player pauses and hops over something underneath the entry sign so I dont
  know what it is thats under there." To find: what solid or step lies under the fascia at a walk-in's door (a kerb, a
  planter's or a rail's solid, the room's threshold) - a class check over every walk-in door: nothing solid and no step
  on the line from the pavement through the door.
- **Shop name signs** (same picture): "like how these signs show up they're nice and easy to read and might make a good
  standard sign angle and size and visibility, but it covers you walking through the door, or at least the overhang
  does" - keep that legibility as the standard (angle, size, contrast), in styles that fit the district, the building
  and its purpose, with variety; and never hide the player going through the door (the sign or its overhang fades or
  sits above the door's opening). For part B's shared kit (shopfronts and signs) - with the standing rules "no big
  overhangs over entrances" and "nothing meant to be seen is hidden".
- **NPC behaviour** (00:33): "more animated and complex ... not just automatically attack (right now it seems like an
  instant pull out weapon and shoot reaction) ... sometimes take cover, react not with violence first, react scared
  and run off, react cautious, react professional and skilled ... interactions and violence and fighting and driving
  and being police or on the job". Server-side (the AI systems); a design first: temperaments by role and district,
  a reaction ladder (notice, warn, flee / call / draw, take cover, fight), skill tiers for police and guards.
- **Pets and wildlife**: the same variety of behaviour where it fits - but nothing that works on purpose may break:
  "I love the details like the quail family sticks together ... I wouldn't want to break any carefully crafted systems
  ... we accidentally over-randomize the individual animal behavior and they all react differently and break up the
  group". Rule for that work: group behaviours (families, flocks, herds) are decided for the group, variation is
  between groups and kinds, and each existing behaviour gets a test before anything round it changes.
- **Dogs at the dog run and in the city** (00:47): "The dog run area doesnt have any dogs or NPCs walkings dogs or
  playing fetch with dogs ... I dont see a lot of dogs or cats or NPCs walking dogs in the cities either. Are these
  already in the game and just need to be spawned in more places". Checked: they are in the game - a dog walker with
  three dogs on leads is one of the street personalities (`server/systems/personas.js` `dogs`, capped at one at a
  time), lost pets (`pets.js`), police dogs (`k9.js`), a hunter's dog (`activities.js`). Nothing is spawned AT a dog
  run (the world marks them: `shared/world3-fenceexits.js` 'dogrun'), there is no fetch, and no cats walk the
  streets. To build: an activity at every dog run (owners on the benches, dogs off the lead, fetch), more walkers by
  district, cats on stoops and in alleys.
- **Vehicles take damage from what they smash** (01:00, an ambulance through a planted median): "you can run over
  infinite things apparently ... things are destructible and vehicles aren't super fragile, but after running through
  enough destructible objects (judging on the size and impact ... crashing into a tree vs. driving over a garbage
  bag) the damage would be comparable." With the 11-23 "vehicles smash things" item: each knockable kind a weight
  (a bag nothing, a planter or a sign a little, a lamp post or a tree a real hit and a stop), damage by weight and
  speed, in `shared/rules.js`.
- **The playtest tool cannot photograph World v3 in the running game** (found 11-25): `tools/playtest.py` gives up
  waiting before the v3 server is up (220 s) and does not get past the first-time question ("What brings you to
  town?"), so the art pass's pictures are offline renders. A dev switch to skip the first-time flow and a longer
  server wait would give real game pictures of any place.
- **The swimmer's water effect** (02:00): "the water fx when a playeer swims looks like a placeholder, it doesnt match
  the art style of the game or how other objects react to water" - thin smooth white rings trailing behind the
  swimmer (anti-aliased circles), where boats have pixel wakes and foam. Art: for the water pass's leftovers
  (ripples and wakes) - a swimmer's wake and splashes in the game's pixel, as the boats' are drawn.
- **Things passing through bridges** (02:36, a road bridge over open water in rain): "A lot of weird things going on
  in the water under bridges too. Just the way things are passing through the bridge, it doesn't happen on all
  bridges though." In the picture a boat and its wake, a police boat and the ring effect are drawn OVER the road
  deck instead of under it. To find: which bridges (a deck whose span is not marked so for the page - host.js draws a
  boat part-way under a deck beneath it; this one reads as ground-level road), then one rule for every bridge:
  boats, wakes, swimmers and their effects under the deck, with a test over all bridges.
- **Live 11-25: see-through buildings along your street or alley** (PR #48, page-side) - on `main` on his word; the
  art branch carries the same code.

## The owner's notes from playing on desktop and phone (PDF "City Life Auto Prebeta v2", 11-25 03:23)
"Dont interrupt the current plan just take note and add appropriately ... if its something to fix now lets do it, if
its something that can wait lets make note of it and revisit at the right time." Sorted:

**Art and the page - taken into the art pass (docs/tasks/ART-CHECK-LIST.md has their state):**
- **See under elevated structures** (a railroad bridge over a street in his picture): "It would help if players can
  see under elevated platforms like this railroad bridge, but im sure highways and maybe some other structures ...
  like we do behind buildings, letting the player see a wide range under a bridge like this."
- **Mountains**: "Mountain areas can look better than this right? We need to get some big rock structure and mountain
  side and cliffs and rocky terrain systems in because this doesnt look good when we create these mountainous areas
  with a group of 4 similar shaped rocks stacked in a row ... water chunks that blend into the mountainous area
  above and foothills below and just a better looking mountain cliff rocky area in general and across the other
  mountain/cliff/rocky areas that are put together like this." A new look: variants to him first.
- **A double yellow line merging into another** on a desert road (two centre lines running into each other, by the
  hospital there): "Does not look right and its right outside this hospital so a lot of people will see it."
- **A road bridge over open water** (seen while spectating): the deck's edge against the water "is too hard"; land
  may run out a way with the bridge, "but eventually the bridge goes over water and there is a passable channel
  underneath for boats and swimmers and fish and animals". And the white idle marks in the shallows by the shore "just
  show as static images instead of animated water ripples ... we want that moving but subtle and natural and
  animated, or can be removed if it isnt needed."
- **The shark**: "not right yet, doesn't look updated, when it opens it mouth to attack part of its head disappear".
- **Faceplant, lying down, sleeping**: "it just leans forward but not falling flat on their face (as well as lying
  down or sleeping, it doesn't lay all the way down)".
- **"Where to?"**: "You dont need to say there's a cheap car to be had near each one." Done 11-25 (ftue.js).
- **Cloud shadows** passing over the world: "Or maybe not a good detail to add not sure." An idea: a still to show him
  before anything is built.

**Game rules and features - logged, not for the art pass:**
- **Boom Tester**: a punching animation, the shot leaving flaming or glowing hands; it should blow up most vehicles in
  one or two hits ("A rocket or explosive or grenade or boom tester should blow up most vehicles in a single hit,
  maybe two it's three if it's especially armored"); and two versions - today's, to which NPCs do not react and which
  earns no record, and one that "acts as a real in game weapon" with NPCs reacting as to gunfire.
- **Vehicles and fire**: badly damaged vehicles sometimes catch fire; fire weapons set a vehicle alight only after
  enough exposure; a burning vehicle goes out or explodes. (With "Vehicles smash things" above.)
- **SAM**: two hits, three at most, to bring down a full-health helicopter; a plane about two, by how easy the lock is.
- **Flamethrower**: far longer range - "at least a quarter way across the screen" on desktop.
- **Wanted level stops** after a great deal of crime on a character made that day: no more stars. A bug to find
  (a cap, a cooldown, or the new-character protection?) - reproduce on a fresh character first.
- **Pepper spray and taser against players**: no keeping a player down for good - full effect the first time or two,
  then little for a while. NPCs matter less.
- **Ambulance job**: wear a paramedic outfit for the job, your own clothes back when it ends or you quit; and the
  ambulance must spawn where it can drive off forward (his spawned nose-on to a brick wall in an alley).
- **Prison**: ideas from The Escapists games - things to do inside, meeting a crime group or a boss who gives work
  outside, a small training bonus inside (strength, cardio) under the in-game daily cap; escapes, jobs, routines.
- **Photo mode**: a camera you set up (zoom, local settings), clean stills and video; shots into a public Discord pile
  that he or moderators approve into a gallery channel; perhaps a gallery in the game.
- **Events**: NPC bank and store robberies (hands up, or run, or fight back for Samaritan points if no innocent is
  hurt); rare streakers, tackled by security or police; a rare streaker at a sports event.

### 11-25, seen during the mountains' water (the art pass; logged, not acted on)
- Granite Hot Springs: the rocks round its pools are near-black (7.9% of the place's picture under 35 of 255 at noon) -
  for the nature redraw's list (art, part A).
- Summit Tarn's outflow ends on the scree after 20 tiles; south of it a road, then a band of rock 40 tiles deep. A
  cascade down the band is the fix (art + world, part A, the mountains' water).

### 11-25 13:33, the owner's notes while looking at the mountain streams ("prioritize correctly dont let me stop the plan")
- **Train riders swim for a few seconds** ("in some places the train might be registering as in water and all the
  people on the train will do a swimming animation for a few seconds then go back to normal"). A system fault (the
  riders' pose is taken from the tile under the car - a bridge or a causeway over water): systems, package 3. To find:
  every stretch of track over water tiles, counted from the data; a test that a rider's pose never reads the ground.
- **The train going into a tunnel** ("you see the front of the train go through the tunnel entrance and still looks
  like its above ground before your screen transitions underground so we need to hide the front part of the train in
  front of you as it goes into the tunnel"). Page drawing: the cars past the portal are not drawn above ground (cut at
  the portal's line). Art pass, part B (transit), or sooner if a transit pass comes first.
- **Tunnel mouths and what they lead into do not line up** (the trains' portals; his words under DECISIONS, "Water
  under a road"). The class: every portal and every water-under-road crossing - the arrival bores (16), the subway's
  mouths, the town creeks' and county roads' culverts. The creeks' own crossings are a bridge deck now (11-25); the
  rest in part B (transit) with the same rule: what goes in is seen to go under.

### 11-25, seen during the desert pass (the art pass; logged, not acted on)
- **Dusty Hollow: a concrete door path laid across the ghost town's gravel street** (a grey slab strip from a door to
  the far side, tiles 5342-5343 x 1807-1810) and big plain brown roofs. Part B (buildings, door paths).
- **The desert highway's edge is saw-toothed** (`asphalt_worn`: blue-grey triangles along both edges, seen at tiles
  5078-5122 x 1984-2016). Part B (roads).
- **The scrub's plant pick leans to the list's middle**: `pickW` on a clumping noise takes brittlebush (2 of 15 by
  weight) four times as often as creosote (4 of 15) - 17,853 to 4,335 in a count over the desert. Every weighted list
  drawn this way does the same. Nature, with the variety pass (part A 3).
- **Hammocks standing free on a lawn** (West Hills' yards, tiles 1358-1402 x 2444-2476: 54 hammocks in the world, his
  11-23 note "hammocks too long"): a hammock wants two trees or posts. Part B (yards), with the hammock's length.

- **People seen through shop windows** (the owner, 11-26 12:40: "if we have humans in the window we want it to be
  actual NPCs through the window, not static images of humans"): the painted busts are gone (art pass, 11-26). Real
  ones would want the street to draw the people inside a walk-in's room behind its glass - today they are drawn only
  from in the room, and a shop that is no walk-in has nobody inside. For his call: wanted, and for which shops.
