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
- **Graphics stop loading on mobile** (Pixel 7 Pro, Medium) after a lot of travel round the world. **Done
  (2026-10-06 night):** much smaller worker caches on phones, workers replaced when they die, failed chunks
  retried (DEVLOG "Phones: the art keeps arriving"). Nothing is downloaded (the art is made on the device), so a
  bigger download wouldn't help; a later option is baking the area round your spawn during the loading screen.
- **Lamp-post shadows [done 2026-10-07]:** a street light casts a big triangle from the top of the post down to its foot. It should
  cast the post's own shape out from its base (the shadow of a thin upright thing in 3D).
- **Running without a button [done 2026-10-07]:** only the keyboard keeps a run key (Shift). On a gamepad or touch, a full stick
  is full speed.
- **On a train, buildings fade too soon [done 2026-10-07].** They go see-through when you pass beside them, so between two
  buildings both fade. On a train, fade only what you are really behind, or nothing.
- **NPCs walk through the train [done 2026-10-07]** when boarding or passing. They should go round it, and board and alight from
  the platform.
- **The Cedar Falls clinic [done 2026-10-07]:** a building in front of it hides the interior when you respawn there.
- **The debug menu [done 2026-10-07]:**
  - **Buttons stay lit:** they stay highlighted after use (4 stars and then clear wanted both stay yellow).
  - **Easy access:** a small debug icon on every device (a pink circle with a bug, grey and see-through until
    activated), or the top option of the menu on a controller. It opens the menu straight away.
  - **Order:** give weapons first, teleport anywhere second, spectate third, with the online player list beside
    it, easy to reach with a stick, d-pad, mouse or touch.
  - **A testing category per feature** (jobs, events, world events, items...) that spawns the thing or takes you
    there.
  - **Weather controls.**
- **Police in the wilderness [done 2026-10-07]:** cops shouldn't spawn right on you while you flee. Fleeing into the wilderness makes
  you harder to find.
- **Umbrellas [done 2026-10-07]:** NPCs hold the umbrella in one hand.

**Then, through the night: the environment pass.**
- Make the procedural nature and the points of interest as close to the concepts as possible (N1-N10, D9-D17,
  E1-E3f, W1-W2).
- Build specific places to the concepts' standard; the user will help fill in around them.
- More variety in the nature assets. More nature concepts are coming.

## From the user's notes (2026-10-07, 16:47)
**Triage:** nothing here is a bug or blocks current work, so the order holds: the blades pass (finishers, the
plasma blade and its wanderer), the soft world border, then roads stage 2. Concepts for everything new are in the
prompt pack: SU1-SU4 (the subway underground), SK1-SK8 (skating and bikes), CR1-CR2 (witnesses), BO1 (bounties).

**Witnesses and reporting by district [done 2026-10-07]**
- Who notices a crime and calls it in depends on who they are and where they are. A high-income NPC in a
  high-income district is far more likely to witness and report than a low-income NPC in a poor district, where
  many look away. Crime is easier in the rough parts of town.
- **Proposal:** each NPC type gets a witness profile (sight range, attention cone, chance to report, delay before
  the call), scaled by the district's wealth and randomised a little per NPC. Today's `law.witnesses` (ranges,
  facing, line of sight, night, cameras) becomes the base it scales.
- **Police presence follows wealth:** fewer patrols and slower responses in poor districts, even once called in.
  Rich districts also have a few clearly visible security cameras (and private security, concept CR2).
- **Players witness too, but don't report automatically.** A toast says "You witnessed a crime". For about a
  minute the phone offers to call it in.
  - **The response:** one unit (a car, an officer on foot, a boat, whatever fits the place) reaches the caller's
    area in about 20 s and looks for that suspect only.
  - **The match:** if the suspect is still nearby in the same outfit (the description: top and bottom colours,
    the vehicle), the officer connects them to the crime. They get stars by its severity, and the normal wanted
    system starts.
  - **Changing clothes** can throw the police off.
  - **No abuse:** only crimes you actually saw can be called in; one unit per call, with a cooldown per caller,
    so it can't summon a fleet that goes after someone else.

**Bounties rework [done 2026-10-07; party splits and cross-server boards later]**
- **Built** (`server/systems/bounties.js`, DEVLOG 2026-10-07): the unlock after 3 kills in an hour (not counting
  police work, wanted victims or self-defence), escrow from the bank, 45 minutes counted only while the target is out
  in the city, the announcement and the golden skull, the Bounties phone app (contracts, last seen, taking one,
  placing one), payment only to a hunter or officer who took the contract (a kill, an arrest, or detaining the target
  alive), refunds when it runs out. Party splits wait for parties; cross-server boards wait for a second server.
- **Before the rework:** the courthouse bounty office, bounties paid from the bank on a recent attacker, the hunter's
  licence, radar pings, and the payout on a kill or an arrest.
- **When:** the option to place one unlocks after the same player kills you 3 times within an hour on the same
  server. It is a revenge measure.
- **The money:** it is your own money, held in escrow. It is only paid out if a hunter accepts the contract and
  kills, arrests or detains the target, and it comes back to you if the bounty runs out.
- **Duration and visibility:** about 30-60 minutes. A global message announces it, and a golden skull floats over
  the target for as long as it lasts.
- **It sticks:** through deaths from anything else, switching servers, logging off and going into an owned
  property. Proposal: the timer only runs while the target is online and outside a private interior, so hiding
  can't run it out.
- **Hunters:** they accept contracts on a Bounties phone app, which gives loose info (the name, a description,
  the district last seen and when). Bounty boards list contracts on this server and on others. A party that
  collects splits it evenly.
- **Needs:** bounties stored on the profile so they survive logging off. Boards across servers wait for a second
  server and a shared store.

**More bicycles [done 2026-10-07; BMX tricks come with skating]**
- **Types:** a one-gear beach cruiser (stable, slowest), a multi-gear mountain bike (the one that copes
  off-road), a road bike (fastest on tarmac, poor off it), a BMX (tricks), a commuter bike and a cargo bike. All
  faster than running.
- **In the world:** NPC riders and bike racks around the world.
- **Theft:** stealing a bike is still a crime (low heat) but less risky than a car. Witnesses notice it at a
  shorter range and react less, randomised per NPC type and district.

**The subway goes underground [W2 stage 6]**
- **Below the main layer:** trains go down a portal (a ramp between retaining walls into a tunnel mouth) and run
  under the main world layer.
  - **Proposal:** while you are below, the street is drawn as a dim, see-through ghost over the lit tunnel.
  - **The ride:** for a rider the light eases in and out: shade at the portal, then the train's windows and
    headlights take over, then the station's fluorescent light.
  - **Engine:** today's separate `sub` level already keeps collision and witnesses apart.
- **Walk or drive in:** from the portals and the platform ends.
  - **Walkways:** a narrow walkway runs along some stretches (urban ones, near stations), not all. Elsewhere,
    walking the tracks is truly dangerous.
  - **Warning:** an oncoming train's headlights light up the rails and walls ahead of it before it appears, with
    the rumble and the horn.
  - **Refuges:** long stretches get refuge alcoves to duck into, so wandering in isn't certain death.
- **Concepts:** the station (T1) and tunnel (T2) exist. New: SU1 (the portal), SU2 (the ghosted street over the
  tunnel), SU3 (walkways, refuges, an oncoming train) and SU4 (how the light changes going down).

**Skating: skateboards, longboards, inline and quad skates, BMX [later, one feature]**
- **Riding:** boards and skates are carried, and you hop on and off anywhere. They are fast and smooth on roads,
  sidewalks and plazas, slow and wobbly on grass, dirt and sand (you get off), and slippery in the rain.
- **Tricks, top-down, taken from Tony Hawk's Pro Skater:**
  - **Moves:** a jump button and a trick button with a stick direction (ollie, kickflip and the rest, grabs
    off ramps, manuals).
  - **Grinds and slides:** they snap onto a rail, ledge, bench, kerb or planter edge in reach mid-jump.
  - **Balance:** a meter for grinds and manuals.
  - **Scoring:** combos chain with a multiplier, manuals link them, and a special meter fills to unlock bigger
    tricks. Gaps (named jumps between spots) pay bonuses.
  - **Bails:** they hurt a little; a helmet helps.
- **Places:** several skate parks (bowls, half-pipes, quarter pipes, stairs and rails), at least one in a city
  park, one by the beach and one under the highway. City plazas have spots tagged as rideable.
- **Skate shops:** boards, longboards, skates, BMX bikes, helmets and pads, clothes.
- **The riding skill:** one skill shared by boards, skates, BMX and bikes, levelled by riding and tricks (with
  the daily cap like the other skills). Each level gives a little more hang time and stability and fewer bails.
  At the top it is a slight edge (about 15%), never a hard advantage.
- **Mini games and events:** 2-minute score sessions with goals (gaps, a long grind, tokens to collect),
  trick-for-trick battles between players, best-trick contests at the parks, longboard downhill races on the
  mountain roads, BMX jump contests.
- **Concepts:** SK1-SK8.

**Still queued from earlier notes:** two-sided stations; bank robberies and heists; helicopters (concept HE1); more
waterfall and cliff art; the UI pass (U1-U12).

## From the user's notes (2026-10-08)
**13:33 and 16:02 (tasks #298-#329, in this order of work):** arrests and the jail (#298) and police escalation by
stars (#299), then the robbery system (#323: hot money, a police standoff outside, limited tills, wanted level growing
with time, takings and the kind of place, people raising their hands and throwing cash), then ambulances with stretchers
(#313), tow trucks (#314) and traffic rerouting (#315), then the rest: drivers reacting to attacks on their car (#300),
the gamepad's right stick aiming and the trigger firing (#301), melee blocking and sword fights (#302), grenades and more
gun shops (#303), the interiors overhaul (#305), heists (#306), pets (#307), pool (#308), casinos and card games (#309),
horse racing (#310), back-alley dice and cockfights (#311), surfing (#312), fully automatic guns (#318), flying (#319),
drive-in theatres (#322), K9 units (#324), horses (#325), the desert train robbery (#326), a bigger world (#327), the
forest wilderness (#328) and the shopping cart (#329).

**18:05: feedback and design notes (the new tasks #334 on; concepts AC1-AC7, IC1-IC5, CW1-CW2, SI1, U13-U16, GO1-GO3,
CF2 and FX2 are in the prompt pack):**
- **Nothing gets lost:** every note goes into this file and the task list; the feature audit (#95) checks the build
  against them.
- **The big map at every zoom:** zoomed out, the sea fills the whole frame (or the frame fits the world): no hard edge
  where the map's water stops.
- **The phone and the debug menu** get the new UI too.
- **The debug menu, organised:** tabs (me, spawn, wardrobe, world, events, travel, players), kept up to date with every
  new feature: ride the subway, a ferry, a bus or a rideshare; spawn any vehicle (helicopters, planes, skateboards
  when they come) and start any event. **The debug wardrobe:** every outfit and piece in the game with a live preview;
  applying one makes it yours (progress is wiped before launch anyway).
- **Menus on a controller:** left and right on the stick or d-pad move left and right in a menu; inside a menu the
  d-pad never opens other things (the phone, the bag).
- **The phone in hand:** your character holds the phone out while its menu is open.
- **Inventory:** see and equip everything: clothes, tools and equipment, use items, and set the quick bar and the
  radial wheel (concept U14).
- **UX across the board:** every menu and system gets a pass for flow and layout on desktop and on phones held either
  way (#248).
- **The character preview** (creator and shops): turn the character round, preview animation loops, idles, sitting and
  actions, and one button back to the default view (U15).
- **Campsites:** no "hunting camp" signs. **Rest spots** far out in the wilds, away from anything built: a campfire
  ring off a trail, sometimes by a view and sometimes in the middle of nowhere, beautiful and quiet (CF2).
- **Fireflies:** rare, at night in natural areas and parks, now and then at the campfire spots (FX2).
- **Crafting:** at a crafting table, work table or workshop (an upgrade for any owned property, and at fitting places
  such as a lean-to by the hunting lodge or a shed), not just a menu at an NPC; it previews what you'll make, an outfit
  on your own character (CW1, CW2).
- **Icons** for every material, object and item you can collect (IC1-IC5).
- **The arcade:** walk in and play simple 8-bit and Atari-style games of our own in the spirit of the classics (a rock
  shooter for two, a maze chase, paddle tennis, descending aliens, a platformer, a side-scrolling brawler, a flappy
  bird, a road-and-river crosser, a brick breaker, a multiplayer racer), multiplayer where possible, plus air hockey,
  skee-ball and pinball. The machine's screen opens in front of you while your character stays standing at it.
  Tickets buy prizes: clothes, sunglasses, a water gun, a foam blaster, a foam sword, and a remote-control car or
  monster truck you drive like a real car while your character stands holding the remote (AC1-AC7).
- **Fewer phones out:** NPCs filming or photographing things is a rare detail, not a crowd.
- **Golf:** a big course where you hit the ball far and think through each hole, and golf carts to drive while you play
  (or steal and take anywhere) (GO1-GO3).
- **Taxis:** hail one with the action button and it pulls up to you; the action button again gets you in (not the
  vehicle button, which throws the driver out).
- **Police patrols:** now and then an officer on foot or a patrol car in town and the suburbs (rare, almost never in the
  wilds), casual until they see a crime; they keep away from gang turf, and gangs don't attack cops who are just driving
  by.
- **Shop symbols:** a small symbol floats over each shop's entrance when you're close, saying what kind of place it is,
  gone once you're inside (and for a moment over the person to talk to); subtle, on by default, can be turned off (SI1).
- **Sound:** a full sound design inspired by SNES-era games that never gets repetitive or annoying: varied engines,
  boats and weapons, ambience in nature, rain and the sea.
  - **The bar (19:43):** Stardew Valley's quality of sound and music, but SNES-flavoured and themed for a GTA-style
    game.
  - **Music lives in the world:** no soundtrack playing over the game. Music plays on the title screen (and the
    tutorial); otherwise it comes from places: a nightclub's bass, muffled from outside and loud and clear inside;
    shops with their own fitting music (light, elevator-style), or none at all.
  - **Shop doors:** a bell over the door at the old ma-and-pa shops (bait and tackle, hardware).
  - **Everything has a sound:** every action and vehicle, each vehicle its own engine.
  - **Peaceful moments:** a campfire's gentle crackle; now and then an owl or crickets at night; subtle, never
    repetitive.
  - **Footsteps by surface and speed:** branches snap under anyone (an animal, an NPC, a player) moving fast through
    the woods, and it's quiet when they sneak.
  - **Options:** sound and music on or off, and the volumes.
- **Campfire effects (19:43):** when it crackles, embers rise into the air and the fire flares; a soft volumetric glow
  round it.
- **Tabbing out on a phone** doesn't disconnect you straight away: the session waits in the background, and the idle
  rule (about 10 minutes) still applies.
- **Friends and crews:** add friends; form a crew before joining so you land on the same server; crew chat; crew
  events and missions such as heists. Crews of up to 4 for now (the user, 18:20).
- **Tabbing out (decided 18:20):** the session stays connected for 5 minutes in the background; the idle kick at 10
  minutes applies to everyone.
- **No skipping a taxi or rideshare ride** (18:20; done the same day).
- **The death screen (18:38):** calling for help and then cancelling must not respawn you sooner than the normal
  countdown, which keeps running whatever you press. On death the menu doesn't pop straight up: you see where it
  happened while the camera slowly zooms out, then the choices come up (Call for help, Call an ambulance, Select spawn
  point). The spawn point defaults to the last place you spawned; press nothing and the countdown respawns you there.
- **The top of a phone held upright (18:41):** the minimap top-left with the time of day and the weather on it; cash,
  bank and the stars anchored top-right; nothing at the very top centre, where phones like the Pixel 7 Pro have the
  camera in the screen (the top row of buttons moves down, or out of the middle).
- **Interiors (19:28):** interesting, working interiors for hospitals, police stations, banks, stores and shops, coffee
  shops, bars and taverns (concepts IN1-IN7: the big public places room by room, and how doors read inside and out).
- **The subway (19:28):** underground still shows the old graphics; the change going down and coming up should be smooth;
  you physically walk down the stairs to see the station below; you can still walk or drive on the tracks (SU1-SU6).
- **Sewers (19:28):** nothing elaborate - a few manholes you can drop into, tunnels under the city that give a few ways
  round and meet the subway here and there (SW1-SW2).
- **Caves and mining (19:28):** cave systems deep in the wilds, and mining above ground at a quarry and on mountainsides.
  Pickaxe tiers: the best ore needs the best pickaxe; ore spawns at random points, the best far out in the wilds.
  Dangers: bats, bears, cougars, spiders, snakes. One cave has an underground river that forks and joins other caves,
  with a rowing boat or small motorboats there. Beautiful and very dark: you need a light, except where glowing
  mushrooms, plants or glow worms are (MI1-MI7).
- **Lights to carry (19:28):** a headlamp, a hard hat with a lamp, a lantern, a heavy flashlight you can hit with, and
  any other light worth carrying (flares, glow sticks).
- **Felling trees (19:28):**
  - **The cutting:** small trees are quick and give little wood; big ones are slow and give more; a giant redwood takes
    a long time and gives a lot. Axes come in tiers, and a chainsaw is best.
  - **The fall:** the tree falls away from the side you cut it from (a short falling animation) and breaks into stacks
    of logs when it lands. A tree falling on someone hurts or kills them, by its size and how it lands.
  - **The wood:** carry a bundle by hand, or load the logs into a vehicle like crates. It upgrades homes, feeds civilian
    missions and gang-hideout upgrades, or sells.
  - **Regrowth:** trees grow back fairly quickly when nobody is around (WD1-WD3).
- **Hit by a car (19:47, #361):** you aren't always knocked flying or rolling.
  - Sometimes you're run over and left face down or on your back: critically hurt, not necessarily dead.
  - Sometimes you're thrown onto the car and ride the hood for a moment before you're thrown off.
  - Stuck rolling on a car's front, steering the other way helps you roll off or fly clear.
- **Arrests (19:52 and 20:00, #362):**
  - **A stuck police car:** one that's stuck, slow to come or going round in circles offers "Make a break for it" after
    10-15 s. Done the same day.
  - **Logging off in custody:** cuffed, on the way in or in jail, you're back in jail when you return. Done the same day.
  - **The cells, next:** part of the police station's inside. You see the other prisoners, and several can share a cell.
    You can walk round it, sit, use the toilet or hold the bars.
  - **Arriving:** the car pulls up at the station and the officers walk you in.
  - **No fighting in a cell:** cellmates can't hurt each other (confirmed 20:47).
- **Explosions (19:54, #363):** bigger, more dramatic and beautiful. A vehicle sometimes blows apart into pieces or is
  thrown into the air.
- **Masks and the eye patch (20:45, on CP2):**
  - A ski mask or balaclava hides the hair: none sticks out.
  - The eye patch has one strap that goes round the head and ties to the patch, like a real one. Not two straps off one
    side.

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
- The subway goes under the world layer, with walkable stretches and refuges: see the 2026-10-07 notes above.

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
