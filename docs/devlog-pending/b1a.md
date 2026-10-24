## 2026-10-23 · Owner's notes, batch b1a: job vehicles go back, debug spawns one at a time, riding isn't idling, the job vehicle's name, search & rescue at its HQ, the cinematic scenes on World v3, pool

### A job's vehicle goes back when the job ends undone
The owner: "Canceling a job should make you have to give up the vehicle like a helicopter so that you can't just take a
job to steal a helicopter then cancel it and have a helicopter." A job given up only marked its vehicle `despawnable`,
which the street tidy-up acts on only once nobody is near and nobody is in it - so whoever was at the wheel kept it for
as long as they liked. Now `jobs.js recall` takes back whatever a job issued (the flatbeds, the cab, the ambulance, the
fire engine, the bus, the tow truck, the tractor and combine, the rescue and charter helicopters, the crop duster, the
coast guard's boat and helicopter) whenever the job ends undone - cancelled from the phone, quit at the counter, expired,
lost - and when a finished job's return-bonus window runs out. Never harsh: on the ground you're set down beside it
three seconds after (time to pull over; it's stopped where it is, nobody thrown out at speed); a boat waits until it's
slow and by a shore or a pier; an aircraft until it's down on the ground - nobody is ever put out in mid-air, and you're
told to land it. Nobody aboard, it's collected four seconds later; its cargo is left on the ground, anyone on its tow
hook let go, the job's NPCs in it go with it. Taken on again for a new job before it goes (the same truck by the
pickup), it's kept. The numbers are `RECALL` in shared/rules.js. Tests: `test/jobrecall.test.js` (new: the cab
cancelled at the wheel, the charter helicopter kept while airborne and taken once landed, the flatbed collected with its
crate left on the ground, the recalled truck issued again and kept); `honestliving`, `sar`, `drivejobs`, `dusting`,
`firefighter`, `paramedic`, `farming` updated / pass.

### The debug menu's vehicles and crashes, one at a time; the cart crash starts after a moment
The owner: "Debug spawning airplanes you can fly in lets you spawn infinite airplanes ... let's not let players spawn
infinite debug items like planes or shopping cart crashes", and "Debug for shopping cart crash, it lets you spawn
infinite shopping cart riders but should just let you do one at a time. It also should start a few seconds after
triggering it so you can watch without the debug menu in the way." `server/dev.js command` now catches what a spawning
command makes (the vehicles and the NPCs sat in them) and, the next time the same kind is asked for, takes the last lot
away: one plane or helicopter of yours at a time, one boat, one car (or bike, cart...), one damaged car, one loaded
flatbed, one cart scene with its riders - unless a player is aboard the old one (then it's left to be tidied up as
usual). The staged happenings that bring cars and people in (street race / chase / armored truck, shootout, a fight, a
mugging) have a five-second cool-down per player. The head-on cart crash's carts now stand still for three seconds
(`devplay.js CART_DELAY_S`, set rolling by `devplay.update`, a new entry in world.js SYSTEMS) and the debug menu closes
itself after any cart command. Tests: `test/devplay.test.js` (the head-on crash held still, then everyone thrown; a
new test: five planes in a row leave one, a car doesn't take your plane, the boat you're in stays, a second crash takes
the first one's carts and riders away).

### Riding the train isn't idling
The owner: "riding the train for 10 minutes kicked me out for idling." The idle kick (players.js idleCheck: asked at
nine minutes, gone at ten) now runs its clock a third as fast for someone along for the ride: on a train or the subway,
a passenger in a bus, a cab, a ferry or anyone's back seat, in your car on a ferry's deck, on the Ferris wheel or a
balloon flight, or watching the cinematic mode's tour (the page sends `{ t: 'cine', tour: 1 }` once a minute while it
runs). That's asked after 27 minutes aboard, disconnected at 30; at the wheel it's ten minutes as before. Flying the
cinematic mode's drone camera or using its panel now counts as being there (`{ t: 'cine' }`, at most every 20 s): those
keys never reached the server before. Test: `test/idle.test.js` (new: a passenger still there at ten and a half
minutes, asked at twenty-seven and a half, gone at thirty; at the wheel, gone at ten).

### "Your truck" for a helicopter
The owner: "Helicopter is referred to as 'your truck' during a job." The plate over the job's vehicle (client/main.js
drawJobTruck) always said YOUR TRUCK. The job's mark now carries the vehicle's model (phone.js truckMark: `[x, y, model]`)
and the plate says what it is - YOUR HELICOPTER, YOUR PLANE, YOUR BOAT, YOUR AMBULANCE, YOUR CAB, YOUR BUS, YOUR FIRE
ENGINE, YOUR TRACTOR, YOUR TRUCK (`vehicleWord` in shared/vehicles.js); the return bonus's note names the vehicle too.
Tests: `test/jobrecall.test.js` (the words; the mark's model), `test/honestliving.test.js` updated.

### Search & rescue: the calls come to the rescue helicopter, signing on at the HQ
The owner: "Regular helicopter shouldn't trigger search and rescue missions, search and rescue jobs should happen when
you accept that job and they should have a search and rescue helicopter to fly for them", and "Prompt to sign in as
search and rescue pilot happens randomly outside of a hospital, we should have a few specific search and rescue HQs".
On a shift the calls now come only while you're at the controls of the rescue helicopter the job issued: out of it the
shift stands by ("get in your Lifeline Rescue Helicopter - the calls come to it"), flying any other helicopter you're
told the calls only come to the rescue one, and nobody out there is "found" from another aircraft. On World v3 signing
on was already only at the Search & Rescue HQ's pad (checked: none of its 25 hospital yard pads offers it), but the
debug menu's / cinematic mode's "Search and rescue" started the shift at the nearest hospital's pad - now at the HQ.
Standing by the HQ's door counts as at the HQ too. (World v3 has the one HQ, at Westport International; more HQs would be a world
change - not in this batch.) Tests: `test/sar.test.js` (no call on foot, the first one once you're in it; a new test: a
Skylark over the hurt hiker finds nobody, no calls come to it, back in the rescue helicopter they do);
`test/world3scenes.test.js` (new, World v3: no hospital pad offers the sign-on, the HQ's pad does, the dev shift starts
from the HQ).

### The cinematic mode's staged scenes, every one, on World v3
The owner: "'No Granite Peaks for World v3' error coming up when trying to teleport to the peaks (through the cinematic
mode)". The debug menu's `place` found a district by the first district of that name in the list - and World v3 keeps
today's city's districts and adds its own, so Granite Peaks and Highland Woods are each in the list twice, the first not
on the v3 map. It now takes the one with the most ground (dev.js districtMiddle), and a name that's exactly a place or a
district wins over one that merely contains it (`placeNamed`: a scene's "Midtown" is the district, not Midtown Houses).
Running all 60 scenes on the v3 world turned up more: the bear scene threw (`wildlife.edgeSpot`'s `[x, y]` read as a
point - now it stands the bear on that bank); the bear and eagle scenes had no place to start from (now Pine Lake and
Willow Valley); the police scenes went on duty first, which seats you in your cruiser, so their teleport refused ("get
out of the vehicle first" - now the place first, then on duty); "At home" needed a home already (now it takes a house);
the tanker-and-row-of-cars scene had no room in Port Westport's container stacks (now Westport Center); the ambulance
scene's patient found no room when `near hospital` had put you at the desk inside (paramedic.js devMedic now looks by
the ambulance). Test: `test/world3scenes.test.js` (new, heavy: every scene's commands run on World v3 - every place
found, no "[dev] No ..." / "Couldn't" / refusal, nothing thrown).

### Pool at the Rusty Spur
The owner: "Tried playing pool and it said you can't do it indoors or something, seems bugged out right now." On World v3
the table works from its long sides, but the prompt only came within 70 px of the table's middle - at its ends (50 px of
table) there was nothing to Act on, and with a skateboard in the bag the vehicle button there tried the board: "Not
indoors - ride it outside." Now the table racks up from within 40 px of its rim on any side (arcade.js POOL_REACH), and
indoors, where there's no riding, the vehicle button does what Act would (the pool table, the bar...) instead of trying
the board. Tests: `test/arcade.test.js` (new: both ends and the side give the prompt, across the room doesn't; the
vehicle button with a board in the bag racks them up, no "not indoors"), `test/world3scenes.test.js` (the v3 table from
every side).
