# Game design notes (user direction, 2026-10-06)

The user's design notes from 2026-10-06, organised by system, with the lead's proposals where the user asked for
them. **Current priority** stays the art overhaul (16-bit SNES pixel art with modern lighting, as in Octopath
Traveler and Eastward) and the World v2 rebuild (`docs/WORLD-V2.md`). Everything here is scheduled after those
unless it is needed by them (homes and properties are placed as part of World v2).

Status tags: **[W2]** built as part of World v2; **[next]** right after the art and world passes; **[later]**.

## Decisions
- Highways: two lanes each way by default (dense urban areas especially), three where ramps merge or on longer
  runs; ramps built into the street network with room to ease on and off. **[W2]**
- Sidewalks: 112 px downtown, 96 commercial, 64 residential. **[W2, done in stage 0]**
- No old art anywhere, not even as a fallback mode. Alternative art for browsers without WebGL2 comes later.
- World v2 is rebuilt from scratch using the original map concept as a rough reference and goes live as it is
  built; the old world is archived (`checkpoint-world-v1`).
- Prison island: out in the open sea. **[W2 stage 5]**

## From play-testing (2026-10-06 afternoon)
**Priority, now:**
- **Phones fall behind at speed** (Pixel 7 Pro, Medium, installed app): **[done 2026-10-06, to be re-tested on the phone]** drive fast and you reach places before
  their streets, buildings and cars are drawn. Load the road ahead first and further ahead the faster you go, put
  a quick first pass down before the full detail, and make vehicles before they come on screen.
- **Living vegetation, water and wind.** **[done 2026-10-06]** Grass, wheat and crops that sway; trees whose leaves
  move with the wind; animated water with waves, beach surf that rolls in and out, and wakes behind boats.
  Still to do: grass and crops parting round people and flattened by tyres (the old renderer's trampling).
  - **The wind:** one controller that everything reads. It is mostly calm, with a subtle idle sway on all
    vegetation; windy spells are rarer events, and gales rarer still.
  - **Cost:** cheap enough for low-end devices.

**Bugs [next]:**
- **Vehicles are too fragile.** **[done 2026-10-06]** Make them tougher, tiered by type; motorcycles get a bit tougher too.
  - **Explosions on impact:** only in a serious head-on collision at high speed (a car must already be badly
    damaged), or when hit by something going very fast.
  - **At 0 health otherwise:** the vehicle slows to a stop, smokes, catches fire, then explodes. That gives you
    time to get out and run.
- **Wind effects suit the place and follow the wind controller.** **[done 2026-10-06]**
  - **City:** the occasional sheet of paper or plastic bag, subtle.
  - **Forest:** leaves.
  - **Mostly** you see plants sway.
  - **Ambient effects:** butterflies and dust motes don't play in a strong wind. Every ambient effect has the
    right conditions and places.
- **Building fades:** **[done 2026-10-06]** only the part that blocks the street and the walkable space goes see-through. The interior
  stays hidden until you walk in through the door.
- **Birds in rain:** no reflection. **[done 2026-10-06]** A faint shadow far below them on the ground is fine, so they read as high up.
- **Rain ripples:** fixed in the world, on the ground, puddles and car roofs. **[done 2026-10-06]** Today they ride on the rain overlay
  and travel with you in a car or on a train.

**Nature (15:40):** rocks in the wilderness are small, hard to see and easy to crash into, and big open areas
have nothing in them. Make fewer, bigger rocks with grass, plants and trees around them, and design nature with
roads, trails and thoughtfully placed set pieces. The quick fix replaces the scattered rocks now. The full design
is World v2 stage 4: see "Nature is designed, not scattered" in `docs/WORLD-V2.md`. The user will send nature
concepts per area.

**World and NPCs:**
- **Hit reactions [done 2026-10-06, `server/systems/reactions.js`]:** a varied set of reactions, animations and physics for people and players.
  - **Bullets:** knocked back and sliding; or a trip, a roll and back up running; a limp once hit; crawling away
    on the stomach.
  - **Shotgun at close range:** knocks people far back and almost always kills.
  - **Explosions:** throw people far.
  - **Bats:** knock people back. Some fall backwards and get up to run or fight. Hit while running, they fall
    forward, roll or faceplant and slide.
  - **Deaths:** a death while running slides or rolls to a stop face up, face down or on the side.
  - **Non-lethal hits:** an attacker who isn't killed may stagger and keep coming, or fall and scramble up.
  - **Hits to kill vary.**
- **Wilderness population [done 2026-10-06]:** mostly animals (deer, rabbits, coyotes, raccoons; the farms'
  livestock), and only a few people who belong there: campers, hikers, nomads, farmers, off-roaders. Few vehicles.
  World v2 stage 4 places more country sites (trailheads, cabins, ranches) for them to belong to.
- **Subway stations [W2 stage 6]:** entrances you can see on the street. The station below tells you where you
  are, with stairs up to the surface. No more blind cuts to an underground view.
- **Train front car [done 2026-10-06]:** seats for passengers and players behind a short driver's cab.
- **Security train [done 2026-10-06]:** the guards shout a warning at the mail car's door and draw on you; inside they
  count down 4 s before they fire, and a guard who turns on you takes a second to draw.

## From play-testing (2026-10-06 evening, 20:33)
The 16-bit art pass is in a good spot: checkpoint branch `checkpoint-art-16bit` (commit 474d1bf, build
`bbb0378cd2c1`, tested by the user on desktop). The tutorial is paused: disabled in the game and no longer kept in
sync until the user redesigns it. Its replacement is planned in the doc "City Life Auto: New-Player Tutorial & Game
Guide" (https://claude.ai/code/artifact/d42f6d7b-a902-43e6-bc52-777b77f1ec47):
- a quick start under a minute (12 animated shots, controls by device first);
- an in-game Game Guide (a visual wiki in 8 sections, every place with a Set waypoint button);
- the ChatGPT image prompts for both, kept in order. New tutorial needs go into that doc, not the game.

**With the highway stage (World v2 1b) [now]:**
- **Vehicles clip through the top of the highway, and the train sticks out of it on a curve:** raise the deck.
- **Spacing in traffic queues:** cars stop bumper to bumper. Leave a gap that varies per driver, some close and
  some roomier.
- **The rider's see-through outline** shows through a motorcycle. Don't show it on vehicles where you can see the
  rider.

**Next, after the highway stage:**
- **Graphics stop loading on mobile** (Pixel 7 Pro, Medium) after a lot of travel round the world. They load
  sooner when frontloaded; a bigger download up front is fine if it helps.
- **Lamp-post shadows:** a street light casts a big triangle from the top of the post down to its foot. It should
  cast the post's own shape out from its base (the shadow of a thin upright thing in 3D).
- **Running without a button:** only the keyboard keeps a run key (Shift). On a gamepad or touch, a full stick
  is full speed.
- **On a train, buildings fade too soon.** They go see-through when you pass beside them, so between two
  buildings both fade. On a train, fade only what you are really behind, or nothing.
- **NPCs walk through the train** when boarding or passing. They should go round it, and board and alight from
  the platform.
- **The Cedar Falls clinic:** a building in front of it hides the interior when you respawn there.
- **The debug menu:**
  - **Buttons stay lit:** they stay highlighted after use (4 stars and then clear wanted both stay yellow).
  - **Easy access:** a small debug icon on every device (a pink circle with a bug, grey and see-through until
    activated), or the top option of the menu on a controller. It opens the menu straight away.
  - **Order:** give weapons first, teleport anywhere second, spectate third, with the online player list beside
    it, easy to reach with a stick, d-pad, mouse or touch.
  - **A testing category per feature** (jobs, events, world events, items...) that spawns the thing or takes you
    there.
  - **Weather controls.**
- **Police in the wilderness:** cops shouldn't spawn right on you while you flee. Fleeing into the wilderness makes
  you harder to find.
- **Umbrellas:** NPCs hold the umbrella in one hand.

**Then, through the night: the environment pass.**
- Make the procedural nature and the points of interest as close to the concepts as possible (N1-N10, D9-D17,
  E1-E3f, W1-W2).
- Build specific places to the concepts' standard; the user will help fill in around them.
- More variety in the nature assets. More nature concepts are coming.

## Sharks [W2 stage 5]
- Extremely rare anywhere in the sea; likeliest round the prison island (still rare).
- Fins are seen now and then: sharks hunting near the surface.
- Bleeding in the water raises the chance a shark comes.

## Player homes and properties [W2 stage 7 for placement; systems next]
**Every property has:** a place to get vehicles in and out (garage, shed, bush), a place to sleep (rest
restores health and earns constitution XP, capped per in-game day), and a place to cook. Waterfront properties
also have a dock and boat storage (boat garage, boat shed).

**Tier 1 (low income, rough districts, the boonies):** cardboard box in a slum alley (garage door nearby);
sewer room through one manhole (pipes, cardboard, sleeping bag, a can of beans on a tiny fire; garage nearby);
dingy studio apartment; cheap mobile home with a garage shed; broken-down RV by the roadside; weathered shack in
the wilderness; falling-apart log cabin deep in the forest (shed garage); hidden mountain cave squat (vehicles
from a nearby bush); falling-apart beach shack with a dock (shed + boat shed); run-down house in a bad part of
town (cracked driveway, small yard, dirty pool); island hut (straw roof, driftwood shed, a fire to light,
makeshift dock); campsite (tent, campfire, a big bush as the garage).
- **Proposed additions:** a roll-up storage unit (the squatter's garage-home); a camp under a highway overpass;
  an old city bus parked in a junkyard; a leaky houseboat at the far end of the marina (dock built in); a room
  above a laundromat.

**Tier 2 (middle income, suburbs, nicer beaches and country):** single-family home on a cul-de-sac and on a
street (garage with a basketball hoop, front and back yard, lawn, small garden); 1-bedroom apartments in the
city and above storefronts; nice forest log cabin; beach cabin with a boat dock and boat garage; nicer island
beach hut with an okay dock and boat shed; group campsite (several tents, seats round a fire); 2-bedroom
apartments in nicer areas; bigger homes with nicer yards, gardens and pools; bigger log cabins.
- **Proposed additions:** a houseboat at the marina; a row house in Old Town; a small farmhouse with a barn
  garage; a loft over a workshop in the industrial district (a big shop garage for car people); a desert adobe
  ranch house; a mountain chalet.

**Tier 3 (luxury):** mansion on a big property (pool, hot tub, basketball court, gardens, beautiful interior);
lakefront house with a private dock in a gated community (open gate); beachfront property with a long dock near
the public beaches; a private island with a renovated castle-like modern home, docks, a ring road, gardens, farm
space, pools, hot tubs, tennis courts and beaches; a luxury apartment (several bedrooms, great kitchen, balcony,
rooftop garden and patio with a hot tub).
- **Proposed additions:** a hillside modern villa with an infinity pool over the city; a lighthouse converted
  into a home on a rocky point; a superyacht moored at the marina (sleep in the cabin, cook in the galley, the
  tender and jet ski bay is the boat garage).

**Tier 4 (homes that are businesses: spawn, sleep, cook, claim as active spot, and earn):**
- **Farm:** big fields and garden, the farm vehicles and equipment; grow, tend and sell crops.
- **Nightclub:** at night NPC patrons come in; you earn per patron and per drink. Most nights a drunk starts a
  fight: beat them up and protect your patrons, and other players who come to cause trouble. On your own property,
  fighting troublemakers or a player who attacked first is not a crime. Hurting patrons is: a few warning strikes
  for accidental hits, but shooting a patron is a crime.
- **Criminal hideout (several around the world):** grow and raise the contraband (below) in the basement and sell
  it to shady buyers across the world. Ranked high enough with a gang, you can have a few of its armed members
  stand guard outside while the hideout is your active property (pick the gang if you rank with several).
- **Proposed additions:** an auto shop (repairs, the re-key service and repaints for NPC customers); a food truck
  (drive it to busy spots and sell); a diner or bar; boat rentals at the marina; a used-car lot; a fishing charter.

**Interiors:** the user wants the option to step inside and do things at home and on the property. Proposal: every
property type gets a small interior (or an outdoor "interior" for the box, the cave, the campsite and the hut),
built from the art v2 interior kit, with the bed, the cooking spot and a storage chest; walk-in, like the shops.
Concept requests for representative interiors per tier are in the prompt pack.

## Owning a property on public servers: proposal
Many players can own the same property (it is a listing, like GTA Online apartments). The user's two ideas
combine well: interiors are private, yards are shared.
1. **Inside is always yours.** Going through your front door puts you in your own copy of the interior: same
   server, a private space only you, your party and invited guests can see. Owners never collide inside. A
   visitor rings the doorbell and you let them in (or not). Nobody can break in. Customising the interior lives
   here.
2. **The yard is shared world, with an active claim.** The garden, lawn, pool, hoop and driveway are part of the
   live world (other players and NPCs can come by, mess with you, rob you: the risk the user wants). The first
   owner present holds the **active claim**: the yard shows their state (their garden, how long their grass is)
   and eases into it when they arrive. The claim lasts while they are on the lot and for 10 minutes after they
   leave; after that the next owner who arrives takes it and the yard eases into their state.
3. **When someone else holds the claim,** another owner can still respawn there, use the garage and go inside
   their own interior (it is private). They just can't do the yard activities, and they see "This property is in
   use by another owner - free in 6:40" with an option to join a server where it is free (needs several servers;
   until then, the timer).
4. **Arriving is safe for everyone:** spawning at a property gives the usual short blinking ghost (no damage dealt
   or taken, can't fire). Two owners of the same property can't hurt each other on that lot for 5 minutes after
   either arrives. Defending your claimed lot (or your nightclub) against someone who attacked first is never a
   crime.
5. **Your yard keeps your progress:** garden plots, crop growth and lawn length are stored on your profile with
   timestamps. Growth counts only your own play time (watering "every few days you're online"). When you are
   away, your state rests in your profile, not in the world.
- Why not fully private yards: the user wants the outside to stay risky and social. Why not one owner per
  property: a public server with thousands of players would run out of houses.
- **Approved by the user (2026-10-06),** with three additions:
  - **Plenty of properties,** so few players share one. Neighbours are fine: a whole row of houses on a
    street can all be for sale.
  - **Selling:** a player can sell a property (back to the market, for most of what they paid) and buy
    another, for when the one they bought is hard to claim.

## Garages and vehicles [next]
- All your garages, boat garages and parking spots share one collection. Pull any owned vehicle from any of them.
- A vehicle you bought is collected where you bought it and is always in your collection. A destroyed one comes
  back after a while, at full health. Vehicles come out at full health.
- Stolen vehicles: take one to a shady mechanic, pay in cash to "take the heat off" (re-key and re-number) and
  repaint it (keep the colour or choose another), then drive it to one of your garages to add it. Boats: the
  shady boat paint shops, then a boat garage you own.
- Parking garages around the world: buy a spot cheaply (each garage separately) and it works as a garage for your
  collection, including cleaned-up stolen cars.

## Skills and progression [next]
- Skills (from the U2 concept): strength, stamina, swimming, driving, shooting, constitution; plus level, lifetime
  criminal EXP and Samaritan points.
- Every activity has a daily cap per in-game day (sleeping, the treadmill, the sauna, swimming, eating healthy,
  cooking...). You can keep levelling a skill the same day by doing a different activity, so planning a daily
  routine is the fast way up. No infinite XP from parking in bed.
- Constitution: resting, healthy food, cooking, home chores, campfires and the bathhouse routine raise it; it
  raises maximum health.

## Downed and dying [next]
- No pop-up over your body: you see yourself on the ground and the world; the screen slowly turns red, redder as
  you get closer to bleeding out (never overpowering).
- After 3 seconds, four options:
  - **Respawn:** at your chosen spawn point, or the default.
  - **Choose respawn location:** a map of the options, spread evenly with more in dense areas: hospitals,
    clinics and properties you own.
  - **Call for help:** alerts players near you.
  - **Call an ambulance:** opens the phone. It costs a little and is only charged if they revive you. The ambulance
    takes at least 10 seconds; after a minute you bleed out. The phone shows how far away it is (metres, and where);
    close the phone to watch yourself.

## Activities and jobs [later]
- **Basketball:** hold to fill a power meter that rises and falls, aim, release; practise to get good.
- **Home life:** cooking, mowing (grass grows if neglected; constitution XP), gardening (plant, water every few
  days you play, harvest; cook it or sell it at the farmers' market or grocery store).
- **Farm work:** harvest a field with the tractor or harvester (pay by how much you collect, back at the barn);
  plant seeds along marked rows; deliver crops to a grocery store or farmers' market in a work truck (most of the
  pay on delivery, the rest when the truck is returned). Crop dusting waits for flying.
- **Campfires:** at campsites, out in the boonies and on beaches, with seats; light them or put them out. Sitting
  by one slowly heals you and otherwise adds constitution XP.

## Contraband [later]
- Fictional, not drugs: a cheeky nod to video-game power-ups without copying any: a green-spotted mushroom, a
  red-and-white-spotted mushroom, a fiery flower, and a rare glowing golden starfish (tidepools mostly, now and then
  on other beaches). Original names and looks (no copied designs or trademarks); they do nothing when used.
- Only shady dealers buy them: alleys, shady pawn shops, the backs of vans, gang hideouts. Hideouts can grow them.
- Deals: buy with cash, run it across town, don't be seen making the deal.

## Money: cash and bank [next]
- The HUD shows your total and your cash on hand.
- Anything criminal is cash only (black-market guns from the back of a van, taking the heat off a car). Carried cash
  can be dropped, so it is risky.
- ATMs no longer deposit automatically: a pop-up with **Deposit all** (the quickest to hit, for when you're on
  the run) and **Use ATM**. On foot only.

## Transit and getting around [W2 stage 6]
- Live transit on the big map: routes and where each vehicle is now. Trains for sure (they run to a fixed schedule),
  subway lines, buses if it's cheap enough, ferry routes.
- **Rideshare app** (a parody, alongside taxis), in three tiers: a premium tier like a taxi (nice car, careful,
  about the same price); a standard tier (less patient, fender benders, gets there); and **Ultra Saver**: a beat-up
  car that races up, hard-brakes and drifts to you, peels out and drives recklessly, with about a 50% chance of
  wrecking (and maybe exploding) before you arrive.

## Server [next]
- Idle kick to save server capacity. Proposal: after 10 minutes with no input, a "Still there?" notice; after 15,
  disconnect (your character goes through the normal ghost period). Menus don't count as idle for the first 30
  minutes.

## UI direction (concepts U1-U9 in `docs/art-v2/targets`)
A clear step up from today's UI. Use it when the UI pass comes:
- **HUD:** minimap top-left with the district name and clock; health, armour, cash and bank top-right; wanted stars
  and the faction badge; the weapon box bottom-right; the objective bottom-left; contextual prompts ("E Enter
  vehicle").
- **Phone apps:** Map, Jobs, Contacts, Bank, Garage, Transit, Taxi, Stats, Camera, Settings.
- **Inventory:** paper doll and equipment slots, an item grid, details, and the weapon wheel.
- **Big map:** a legend with layers and the transit lines.
- **Panels:** shop, job offer and dialogue.
- **Front end:** title, character creator, and settings tabs (Graphics, Audio, Controls, Content) with the
  "Blood and gore" and "Censored nudity" toggles.
- **State screens:** arrested, hospitalised, wanted level up, joined the police, stats and progression.
