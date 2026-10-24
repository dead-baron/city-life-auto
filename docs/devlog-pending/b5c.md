## 2026-10-24 - b5c: the owner's notes 2, gameplay - campfires, police dogs on leads, riders knocked off, nobody parked in, every vehicle in the debug menu, felled trees cut up into firewood

Six of the owner's second set of notes (10-24), the gameplay ones. The server decides all of it; the page only draws
what it's told.

### Campfires take a moment (server/systems/burning.js)
"You can catch on fire standing in a campfire but I think it should take a few seconds of standing in it." Standing in
a lit fire's flames (within BURN.campPx) now runs a clock on you: **BURN.campS, 2.5 s**, and you go up (shared/rules.js).
Step out and it cools off twice as fast (BURN.campCool) - a quick step through is safe. The city's people still step
round their fires; only one knocked down into the flames and lying there long enough catches.

### Police dogs (server/systems/k9.js)
"Way too aggressive and fast ... glitch out back and forth ... police officers holding them on leash and getting close
before they let them go ... you can't kill a k9 dog but if you injure it the dog will limp off ... you should be able to
knock it off and run away, it is just meant to slow you down a bit and take a little health." The dog now has modes:
- **On the lead**: out of the car it walks at its handler's side, straining toward you, the lead no longer than
  K9.leash. On the wire the dog's parent field is its handler's id, and both views draw the lead from the handler's hand
  to its collar (client/render/carryfx.js), slack when close, taut when it pulls. It barks every couple of seconds while
  it's after you.
- **Let go only near you**: within K9.release (260 px) of you (or within 1.6x that after the handler's been out 10 s) -
  a bark and a word on your screen ("The officer lets the police dog off the lead") are the heads-up.
- **A little faster than you**: K9.speed 1.36 x a run is about 240 px/s against a sprint's 222 (it was 2.7 x a walk,
  over 480). Closing in it never takes a step past its mark.
- **It gets hold, it doesn't bring you down**: the dog holds on at your side - placed there each step, not stepped,
  so no more back and forth - for up to K9.latchS (4 s). You're slowed to K9.drag (45%: players.js pedMods, sent to
  your page in the self record so prediction agrees), and it takes K9.dps (3) health a second, never below K9.floor
  (35%) of yours. **Mash attack** (K9.mash presses) or hit it and it's knocked off, slowed a while (K9.slowMul for
  K9.slowS), and it can't take hold again for K9.every seconds.
- **Never killed**: combat.js hands any damage to a police dog to k9.hurt (health floors at 1; kill() refuses it).
  Below half its health it yelps and **limps off** away from whoever hurt it (K9.limpMul), drawn limping in art v2 (a
  pet with low health and moving: the animals' own 'limp' pose, client/art2/game/host.js), then heels and sits the rest
  of the call out; back in the car it's rested. Every other pet is untouched by blows, as before.
- The numbers moved to shared/rules-play.js (below).

### Riders knocked off (server/systems/vehicles.js openRide, riderHit, throwRider)
"If they're in the open and you shoot at them it should knock them off the vehicle ... they should fall off if they get
injured enough or die while on a vehicle." Open is what draws its rider: kind 'bike' (motorbikes, bicycles, the horse,
the shopping cart, the skateboard) and every boat with a crew layout (the jet ski, the rowboat, the kayak, the RIB, the
pontoon, the sailboat...). The convertible and the 4x4 don't draw who's in them and keep them in, as the closed cars do.
- A hit of RIDER_KNOCK.big (30%) of their health or more, or one that leaves them under RIDER_KNOCK.hp (45%), throws
  them off: the vehicle's momentum and a push the way the hit came, and a tumble (vehicles.fling). Off a boat they go
  over the side into the water beside it with a splash. A skateboard's rider bails off the board (skate.bail).
- Dying on one always throws them (combat.kill): they fall with the speed they had, so reactions.died lays them down
  sliding or rolling.
- The vehicle carries on with nobody's hand on the throttle and rolls to a stop (traffic drops its AI).
- A shot that hits an open vehicle hits someone on it, any seat, for half the shot (it was a motorbike's driver only),
  a player's shot weighing on the city's people as a direct one does.

### Nobody parked in (server/systems/doorways.js)
"Make sure players can't just park a car outside the entrance of a building (like a hospital) and block people from
getting out." The chosen way: **walk through vehicles at the doors**. Every way in and out is a doorway point - each
place's door and its outside spot (shops, lobbies, the hospitals, the police, the stations), every walk-in's doorway,
each home's front and back doors, its garage and garage door, the garages, the subway kiosks. On foot within DOORWAY.r
(56 px) of one, the vehicle-vs-people step doesn't push you out of a vehicle standing there; you walk on through, and
keep walking through that one vehicle until you're clear of it (ped.passVeh), so a bus across a door is no wall
either. Players and NPCs alike; a vehicle moving at speed still hits you as ever. The page never predicted pushes off
vehicles, so it agrees. The vehicles are the only things anyone can set down that a person on foot is pushed out of
(crates and bags are walked over), so that is all it needs.

### Every vehicle in the debug menu (client/devcats.js)
"Art dirtbikes available to spawn in the debug menu? Or other vehicles we've added in like golf carts." Six spawn
sections are made from shared/vehicles.js: **cars, bikes & motorbikes, boats, aircraft, work & emergency vehicles,
horses, carts, boards & the rest** - every type once, by name, sorted. A new type falls into its group by its kind (the
work vehicles and the odd ones by name), so it turns up without touching the menu. The 'car' command keeps batch 1's
rule: one of a kind at a time per class (a new car takes your last car away, unless someone's in it). The old hand-made
Vehicles, Bicycles and Motorcycles lists kept only their non-spawning buttons (the shops, the bike rack, me up on a horse).
- **Fixed on the way**: the skateboard (b4c) and the Riviera Convertible (b4e) both had wire index 52, so one was drawn
  as the other; the convertible is 76 now (test/fleet.test.js "indexes unique" was failing on batch 4).

### Felled trees cut up into firewood (server/systems/felling.js, client/render/carryfx.js)
"Trees falling still has placeholder animation ... when the tree hits the ground it explodes into crates ... chop the
whole tree up and then it puts the wood into bundles that looks like stacked wood (but still acts like a crate) ...
deliver that somewhere that purchases wood ... or take it to your home ... store that wood there."
- **The fall** (both views now - it was art v2 only): the tree tips over faster and faster through the server's FALL_S,
  bounces up off the ground and back, settles, and the crown shakes a moment; dust and leaves where it lands.
- **The trunk stays** (world.logs, a bit per round still uncut; a player joining gets [index, size, mask, ...] in the
  welcome) with no crates out of nowhere. TREE_SIZES.logs is its rounds now: 2, 3, 5, 9 by size.
- **Cut it up**: facing it with any cutting tool, hold Act - a few strokes (FIREWOOD.work: an axe about 1.5 s, the
  chainsaw a breath) and a round comes off, then straight on to the next one in reach while you hold. The trunk shows
  its cut faces as it shortens ('logcut'), the crown going with the last round.
- **Each round is a firewood bundle**: a tier-1 crate labelled Firewood, carried, loaded onto a pickup or a flatbed and
  knocked off it like any crate, drawn as split logs stacked three and two with pale cut ends, roped round - art v2's
  own voxel model (client/art2/game/actors.js), the classic view's drawing (client/render/sprites.js drawCrate).
- **Sold** at a hardware store (LOG_BUNDLE_PRICE, $45) or for more at a sawmill or lumber yard (FIREWOOD.mill, $65 -
  World v3's Timber Bend Sawmill), carried in, or driven up with them on the bed: one Act sells the load.
- **Stored at home**: carried or driven up to your own home's garage, "Stack the firewood in your garage" keeps them
  there as a count per home (profile.homeWood[home id]) for the home upgrades to come.

### Sound
'logcut' (a round off a trunk) thuds; 'yelp' (the police dog hurt) is a quiet bark. The skateboard had no engine class
(client/sound/vehicles.js - test/sound.test.js was failing on batch 4): 'pedal', never voiced (the rider's board is
skate.js's).

### Where the numbers live
BURN.campS / campCool are in shared/rules.js. K9, RIDER_KNOCK, DOORWAY and FIREWOOD - numbers only the server plays
out - are in the new **shared/rules-play.js**, out of the page's code like shared/rules-games.js (the page was at its
498 KB budget).

### Controls
README: two rows - cutting a felled trunk (hold E / B / ACT facing it; E at the wheel by a buyer or your garage) and
knocking a police dog off (mash attack).

### Tests
test/campfires.test.js (the 2.5 s), test/k9.test.js (rewritten: the lead and its length, the release distance, a little
faster than a sprint, the hold without jitter, the slowing and the health floor, mashing and a blow knocking it off,
the limp at low health, never killed, other pets as they were), test/riders.test.js (new), test/doorways.test.js
(new: out of your home's door and a hospital's with a van across it, a player and an NPC; a car away from doors still
solid), test/devplay.test.js (every type listed once in its group, each spawns, still one at a time),
test/felling.test.js (felling to rounds to bundles, carried, loaded, sold at the hardware store; sold off the bed,
the sawmill's better price, stored at your garage by truck and on foot; the clients' fall, trunk, cuts, lead and the
bundle's art in both views), test/fleet.test.js (reads the generated menu). test/ems.test.js "the stretcher" fails
run as a whole file on batch 4 as it was (it passes alone) - not this change.

Perf: page 497.6 of 498 KB, renderer 400.4 of 400 (the firewood model; actors.js's header trimmed to fit), bake 874.6
of 875 - no budget raised.
