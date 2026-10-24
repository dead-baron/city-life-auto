# Pending DEVLOG entries (branch fix-b1b, the owner's notes of 10-22)

## Blows from the guard; a guarded walk
The owner: holding the right mouse button to block, a left click did nothing; walking in the guard (fists, a sword...)
there was no walk - the character floated along in the guard pose.
- A punch or a swing thrown with the guard held now goes (server/systems/players.js): the guard drops for the blow
  (rules.js `GUARD.strikeS`, 0.3 s - a 'guard' t:0 event so everyone sees the blow, not the guard) and comes straight
  back up while the button is held; held down with the attack button too, a blow each time the weapon is ready and the
  guard up in between. NPCs still don't strike from their guard; only the plasma blade deflects bullets and arrows.
- Touch: the fire button with the aim stick held short of firing keeps the guard bit (client/input.js), so it works
  the same there; a pad already sent RT and LT together.
- The page shows the blow over the guard (main.js pedPose), and moving in the guard is a pose of its own, `guardw`
  (client/art2/dances.js): the walk's stride on bent knees with the guard's arms, lean and head - six frames on the
  stride's phase (peds.js pedFrame, main.js pedLook). The classic view draws it as the aim, like the guard.
- Tests: test/blocking.test.js (a blow from the guard and the guard back after it; held: blows with the guard up in
  between; `guardw` strides and is its own pose).

## A more forgiving wanted level at the top
The owner: "Getting a 5 star wanted level is really aggressive/sensitive, it should take longer to get a full 5 star."
- 4 and 5 stars need more heat (`STAR_HEAT`: 110 and 200, were 100 and 160; 1-3 stars unchanged at 10 / 30 / 60). The
  live thresholds and `starsForHeat` now live in shared/rules.js and everything imports them from there; the old copy in
  shared/constants.js is left byte-for-byte as it was, because any change to constants.js re-keys the World v3 world and
  every browser's baked chunks (`world3` / `art` / `art3` in version.json) - remove it the next time constants.js has to
  change anyway (test/wantedladder.test.js fails if anything imports it). And above 3 stars' heat a crime's heat counts for only 60% of itself (rules.js `HEAT_TOP`; law.js
  `heatAfter`, applied in `crime`, `calledIn` and to a robbery's and a bank heist's growing heat). Alarms and the dev
  menu that put you at so many stars (`addHeat` without `damp`) still do. PeakWantedLevelMemory is as it was.
- Crimes (called in) to reach each star, before -> after: murders 2/3/4/5 stars at 1/2/3/4 -> 1/2/4/7; killing
  officers 3/4/5 at 1/2/2 -> 1/2/4; assaults 1/2/3/4/5 at 1/2/4/7/11 -> 1/2/4/10/20.
- Tests: test/wantedladder.test.js (new: the ladder, alarms still set stars, nobody reads the old copy); core, crime, robbery, heist, police, arrests, prison, stops, bounties,
  policeair, trains, brawls, struggle, cells, airtraffic, underground and drivejobs still pass.

## People no longer burst into flames walking down the street
The owner: "Some NPCs seem to be randomly catching on fire ... they will just burst into flames and run off and die"
(a city street; the campfire fix of 10-21 didn't cover it).
- Found with a headless run (World v3, a player standing still in Midtown 15 in-game minutes, every 'ignite' traced to
  its caller): 370 people set alight round the player, 360 of them by burning.js's contact with someone else on fire -
  a burning passer-by, or someone down and burning on the pavement (the 'fall' plan burns on where they lie), lit
  whoever walked past, who ran on through the crowd and lit more; the first fire came from a car burning out after a
  crash (8 by walking past a burning car or wreck, 2 by the blast). Westport Center: 153, 133 of them the same way.
- burning.js `contacts`: the city's people step round fire as they go about. A player still catches walking into a
  burning car, a wreck, a campfire or someone alight; anyone else only when thrown into it (knocked down, flung,
  tumbling - as the campfire rule of 10-16 already did) or when a burning player runs into them. Blasts, a car blowing
  up with you in it, fire arrows, the flamethrower and the firefighter job's fires are as they were.
- Tests: test/burning.test.js (a passer-by steps round a burning wreck, knocked into it they catch, a player brushing
  it catches; new: someone down and burning lights none of 30 passers-by, but a player walking into them). After the
  fix the same Midtown run had 0 ignitions from contact (see the calm-streets entry for the numbers).

## NPC boats only on real water
The owner: "NPC boats showing up in city ponds, assuming they are showing up in other places they shouldn't be at too?"
(a boat in a plaza's lily pond).
- The boaters (dinghies, speedboats, jet skis) and the harbour patrol boats were put on the map's `seaPoints` - every
  10 tiles of any 7 x 7 tiles of open water that isn't a river. A survey of World v3 (every sea point's water body,
  flood-filled): 26 of the 126,378 points are in ponds - Midtown's plaza pond (323 tiles of water), Northgate's two
  (196, 552), the Stadium District's (526, 613), The Strip's (416, 640), West Hills' long pond (567), the airport's
  (1,374) and a puddle in Liberty Bay. Standing by one counted as "by the water" and brought boats onto it. The
  anglers' rowboats (`fishSpots`: lakes only) were all on real lakes already - the smallest a tarn in Granite Peaks,
  368 tiles of water - and the big rivers' calm pockets.
- server/systems/boats.js: `waterSize` (a bounded flood fill of a water body's open water) and `bigWater`: the boaters'
  and patrol boats' points must be on 2,500 tiles of water or more (spawning, picking where to go next, and "by the
  water" at all); the anglers' lakes on 300 or more (none dropped today; ponds stay out from now on). The answer for
  each point is kept, so only the points round the players are ever filled.
- Tests: test/calmstreets.test.js (heavy: builds World v3) - no boat on any pond's point, the anglers' lakes, a player
  by the biggest pond a minute: no NPC boat on it.

## Calm streets: a player standing about no longer watches the block fall apart
The owner: "When staying in one area too long it seems like chaos starts happening, a lot of cars start getting jammed
in a spot, fights break out" / "Maybe in the 'bad' parts of town or gang areas, but otherwise things should be pretty
tame."
- Measured headless (World v3 as the server runs it, npcBudget 700, a player standing still on a pavement for 15
  in-game minutes; counted within 640 px every 10 s): Midtown before - 370 people set alight, 92 deaths, 406 crash
  events, 7 cars blown up, 146 NPC punches/swings, up to 15 people fleeing at once, 5.4 cars stuck 30 s+ on average (12
  at the worst); Westport Center - 153 alight, 45 deaths, 257 crashes, 11 cars blown up; West Hills (quiet suburb) was
  already calm. The loops found:
  1. fire passing from person to person (see the fire entry);
  2. two NPC cars knocking each other (impact > 110 px/s - a hundred-odd times in 10 minutes round one player) sent both
     drivers into a 10 s panic: 520 px/s, blind to what's ahead (vehicles.js -> npc.onVehicleHit) - into the next car,
     the next crowd, a burning wreck; and a slow knock could get the driver out to fight the other driver;
  3. a street brawl's blows landed on whoever stood nearest in the arc - the crowd that stops to watch and film - who
     fought back (npc.onAttacked), and so on;
  4. a passer-by pinned in the road against a lorry in a queue, and the car behind waiting on someone on foot for ever:
     a dozen cars locked round the corner by Midtown station for the whole run (never cleared: in the player's view);
  5. a purse snatch every 70-130 s, a happening every 90-210 s (a third of them street fights) and a street event every
     3-7 minutes, all round the same player wherever they stood.
- Changes: vehicles.js - an NPC driver panics (or gets out to fight) only when a player's car is in the knock; combat.js
  melee - someone in a fight only lands blows on the one they're fighting; traffic.js - held up by someone on foot in
  the road, a driver honks after 2.5 s (the horn flag), someone at a loose end steps out to the nearest pavement
  (npc.js `shoo`), and after 6 s the car edges past at 28 px/s, nudging them aside (a crawl only shoves, never hurts);
  rules.js `CALM_STREETS` + events.js `roughAt` / `busyNear`: away from the rough, poor and red-light districts and gang
  turf only 20% of the happenings that would be a street fight are one and half the snatches happen, and nothing new
  starts round a player (a happening, a snatch, a street race / chase / armored run) while two incidents are already
  going on within 900 px.
- After, same runs: Midtown - 0 alight, 3 deaths (run over), 46 crashes, 0 cars blown up, 17 swings, at most 4 fleeing,
  0 panicked cars, 0.38 cars stuck on average (6 at the worst, cleared); Westport Center - 0 alight, 0 deaths, 7
  crashes, 0 blown up, 1 swing; West Hills - 0 / 0 / 0 crashes, two happening street fights.
- Tests: test/calmstreets.test.js (heavy, new: 8 in-game minutes in Midtown - at most 2 set alight, 4 deaths, 100
  crashes, 1 car blown up, 4 fights, 1 panicked car, 10 stuck at the worst and 3 on average); test/reroute.test.js
  (new: honked at, a passer-by steps out of the road; one who won't move is nudged past unhurt); happenings,
  streetlife, brawls, blocking, reactions, npcpeople, core, police, gameplay, crime, vehdamage, bikes, roadends,
  trafficwalls, transit, ems still pass. The sim script itself: scratchpad calm.mjs (not committed).
