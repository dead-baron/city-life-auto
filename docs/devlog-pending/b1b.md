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
