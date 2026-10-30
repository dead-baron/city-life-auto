## 2026-10-30 - Batch 8a: the taxi a player hails, Crazy Taxi, the trucker and the big rigs, the mail carrier

The owner's notes part 2 (2026-10-24):
- "Taxi Driving job - But we should make a version that pays okay that is pretty straight forward just picking up NPCs
  and dropping them off places (or even pick up other players if they hail a taxi and you see it you can go pick them
  up if another NPC doesnt do it first). But then we should have a Crazy Taxi style mode that is similar to the classic
  Sega Crazy Taxi game where you have to try to get passengers from one place to the other as fast as you can."
- "Big rig trucks on highways, truck driving jobs available to haul goods across the world." / "Jobs - Trucker job,
  long hauls across the world on the highway"
- "Mail man/package delivery job"

### What was there
The taxi driver (H72, server/systems/taxijob.js): NPC fares hailing or ringing in, the meter, the tip, the scared fare
who bails - the "plain version that pays okay" was already in. The city's taxis a player calls or hails (transit.js).
The job cards (client/jobcard.js), the job's issued vehicle and its recall (jobs.js workTruck), open-cargo crates
(cargo.js), the tow truck's hook. No semi, no trailers, no post office job (World v3 has the Midtown Post Office as a
'delivery' place; mailboxes are props by the homes).

### What's new
- **A player hailing a cab** (taxijob.js playerHail): calling a taxi on the phone (Transit > Rides) also sends every
  on-duty player cab driver within CABHAIL.hailR with nobody in the back (an NPC pick-up they were heading for is
  dropped: a player first) - "Dispatch: X wants a cab, first cab there gets the fare". The city's taxi comes too: the
  rider gets in whichever is first ("Get in X's cab"), the others are stood down. A player can also hail an on-duty
  player's empty cab going by. Aboard, the rider's waypoint is where to (the page already sends it for a city taxi -
  the rider's HUD taxi strip and the Transit app show the player's cab the same way); getting out, the rider pays the
  meter (CAB.flag + perKm) to the driver - no tip or company bonus, so the money only changes hands (no farming it
  between friends). The rider's arm is up while hailing (pp 'hail', as the NPC fares').
- **Crazy Taxi** (crazytaxi.js): the taxi rank's job card now carries an "or" - Crazy Taxi - (and the phone's Jobs
  list). A cab, and the clock (CRAZY.startS 50 s) starts when you get in. Three fares wave from rings on the pavement round you (by the kerb, never under a building's roof), by
  their trip: green short, yellow longer, red long (more pay, more seconds). Stop by one and they jump in; each has its
  own clock (par from the distance; late, "I'LL WALK!"). Set down in time: SPEEDY / GOOD / SLOW - the pay and the
  seconds back (the clock at most CRAZY.maxS). Tips on the way: a near miss with a vehicle, a drift, a flat-out dash,
  each times the combo (to x10); a crash loses the combo. The HUD's job card shows the clock (red under 10 s) and the
  fare's own, the chip too; a big green arrow over you points the way (client/jobway.js), the rings on the ground in
  their colours; the tips float up over the cab with a coin sound. Time up: the run card (client/jobcard.js
  showRunCard) - the licence S to E by the takings, the fares, the tips, the best combo and your best run
  (profile.crazyBest, "NEW BEST RUN!") - Again (the same cab, where you are) or Done; it goes by itself after 15 s.
  Not done: jumps - cars never leave the ground in this game's physics, so there's nothing to tip for.
- **The big rigs** (rigs.js; shared/vehicles.js semi, trailer, boxtrailer): a tractor unit and a trailer that's its own
  vehicle, never driven, hitched at the fifth wheel. Each tick after the physics the trailer is dragged by its kingpin -
  its rear axle stays put and it swings round to point at the fifth wheel, so it follows the tractor's path and cuts the
  corners as a trailer does (folding at most RIG.jack). It carries the speed it moved at (it shoves what it sweeps
  into; what hits it hits it), the pair never collide with each other (vehicles.js), there's no way into a trailer.
  At the wheel of a rig, stopped: Act unhitches the trailer, or - the fifth wheel backed under a trailer's kingpin,
  lined up - hitches it. A hitched trailer has no physics step of its own (no knocks off the kerb as it swings: the load's condition
  counts real hits). The page drags the trailer you're pulling along on your fifth wheel as you see it, the same way,
  eased toward the server's angle (main.js glueTrailer: the wire's extra bit 3 says it's hitched; yours is the one on
  the server's fifth wheel - the server can run well behind your prediction on a loaded machine) and its crates with it. The city's own rigs run the highways:
  RIG.npc of the traffic spawned on a highway is a semi with a box van trailer (traffic.js), the trailer gone with it.
  The models (client/art2/fleet.js, loaded with the batch-4 fleet): a long-nosed conventional with its sleeper, twin
  stacks and the fifth wheel's plate; the flatbed trailer's plank deck, stakes and headboard; the box van's ribs,
  swing doors and a reefer unit on some. Sounds: the truck diesel and air brakes; the hitch's clank.
- **The trucker** (truckjob.js): Act at a freight depot (the yards' and the port's warehouses, Portside Logistics' menu)
  or the phone: the card names the haul (from the depot nearest you to a buyer RIG.haul px across the world - a
  grocery, a market, a hardware store, a farm, a gas station, a roadhouse...) and its pay. A rig is issued at the kerb
  outside with a flatbed trailer of RIG.crates open crates (the depot's goods: lumber, steel, produce, freight) - in
  plain view, anyone can take one (cargo theft; the fence pays for it, and the haul goes on a crate short). Stop in the
  buyer's yard: paid base + by the km, times the share of the crates still aboard and the load's condition (RIG.hitCut a
  hard knock). The rig's then the company's to bring back for the return bonus.
- **The mail carrier** (mailjob.js): at the post office (the Midtown Post Office; a city without one, its freight
  depot) the card offers the van round, "or" the walking round. The van round: MAILJOB.van homes of one neighbourhood -
  letters to each home's mailbox (posted from the van's window, stopped by it) or through the door, and two parcels in
  the back of the Delivery Van to carry to their doors ("Leave the parcel on the doorstep"). The walking round: letters
  only, homes near the post office. Paid by the stop, a bonus for the round, +1 Samaritan a stop; the stops are rings on
  the ground (blue letters, gold parcels) and the job card counts them.

### Controls
No new keys: Act at the place for its card; Act stopped in a rig to hitch / unhitch; Act by a mailbox, a door or in the
van stopped by a mailbox; the vehicle key to get out of a player's cab. README rows added.

### Tests
test/b8jobs.test.js: the board's cards and the rank's "or"; the trailer following round a turn on the fifth wheel,
unhitched and hitched again, the city's trailer gone with its rig; the haul paid by the crates and the knocks; Crazy
Taxi's clock, a fare from a ring, a near-miss tip, the pay and the seconds back, the run card and Again; a player
hailing a player's cab, riding, picking where and paying the driver; the van and walking mail rounds; the rigs' models.

### Budgets
Page 469 / 520 KB. Renderer 401 / 401 and bake 906 / 906: shared/vehicles.js grew by the three vehicles, so the long
header comment of client/art2/vehicles.js was condensed to make room (the bake 906.4); the models themselves load with
the fleet, outside both.

### Shots
In the scratchpad's b8a-shots: the Jobs app (desk-jobs-app*.png), a Crazy Taxi run - the clock and the green arrow,
the rings, a fare aboard with its own clock on the card, the run card (desk/phone-crazy-*.png), the rig and its
trailer of crates turning (desk/phone-haul-*.png), the mail van round and a walking round's stop and the letters
posted (desk/phone-mail-*.png).
