## 2026-10-24 - Batch 4a: finding your way on jobs, the siren that clears the road, search and rescue out in the wild

### The job's waypoint (the owner: "On jobs let's give a waypoint arrow or line that helps players know where they're going for the job. In the ambulance job it's hard to know where to go")
- The server already decided each job's target (server/systems/phone.js jobTarget: the fare then the drop, the next bus
  stop, the wreck then the impound, the patient then the hospital, the fire, the delivery, the field, the search circle,
  the job's truck until you're in it) and the self record carried it (me.job). The radar and the map marked it; on the
  screen there was only a small marker over it once it was in view.
- client/jobway.js (new, loaded the first time you have a job): off screen, a pulsing yellow arrow at the screen's edge
  points to it, with how far (m / km) on a plate beside it. A rescue call's search circle is drawn on the ground too
  (dashed orange); inside it the arrow gives way to "SEARCH AREA - LOOK FOR THEM". While the job's truck is waiting for
  you its own ring and arrow lead (as before).
- The GPS line (client/route.js) follows the roads to the job when you've set no waypoint of your own - on the radar and
  the map, on foot or driving; not in an aircraft or a boat. A target on the move (a fare walking up) is snapped to a
  96 px grid so it doesn't re-route every frame.
- The map's panel: picking the job's line takes the map to it (the search circle with it).
- test/jobway.test.js: every job on the phone's list (deliveries, the farm, search and rescue, crop dusting, charter,
  the coast guard by boat and air, field work, firefighter, paramedic, taxi, bus, tow truck) sends a finite target, its
  vehicle marked until you're in it and the target in the self record; the target follows the job (the patient, the
  fire, the fare then where they go, the search circle's middle then the person found).

### The siren (the owner: "There should be a siren for the ambulance that makes people get out of the way faster so it's easier to drive")
- H already switched it (any police car, the ambulance, the fire engine); traffic eased over only for one coming at 60
  px/s or more within 380 px. Now (server/systems/traffic.js SIREN_YIELD) it's heard from 520 px plus 0.6 s of its speed,
  110 px either side, even crawling up behind a queue (20 px/s).
- People get out of the road (server/systems/npc.js clearWay, called a few times a second from vehicles.js): anyone at a
  loose end in the road up to 380 px ahead (more the faster it comes), 80 px either side of its way, steps off to the
  nearest pavement at a run. A player's horn now does the same for someone just in front (170 px), at a walk. NPC
  police cars, ambulances and fire engines running their sirens clear the road the same way.
- The ambulance's and the fire engine's siren come on by themselves with each call (H still switches it off); the call's
  message says so.

### Search and rescue (the owner: "Search and rescue missions should be out in the wilderness not in a small city park"; "We should have a few specific search and rescue HQs to take these missions not the hospital")
- Five bases (shared/world3-sarhq.js SAR_HQS, built by the same layout as the first): the Search & Rescue HQ at Westport
  International, the Granite Peaks Ranger Station (up in the peaks, by the road), the Egret Coast Coastguard Station (by
  the shore: the marsh and the open sea), the Red Rock Rescue Post (in the canyons off the desert road), the Sandpiper
  Coastguard Station (on the east coast west of the point). Each: the HQ building and its door (a 'sar' place), the
  hangar, the helipad with its lights (a rescue helicopter parked on it), the windsock, the fuel, the lamps and a paved
  drive to the nearest road. The wild ones keep off the designed nature places and 3 tiles clear of the relief's cliff bands (no drive
  where it would run along one), and clear the trees and rocks off their
  apron and drive. m.world3.sarHqs lists them (sarHq the first, as before).
- Calls only from the wilderness (server/systems/sar.js wildDistrict): the wild districts (the woods, the peaks, the
  desert, the rocks and islets) and the open coast that's a region of its own (the Sandpiper Coast) - no parks, no farm
  valley, no beach towns - with at most two buildings within 40 tiles (a cabin, a campground, not a town), and the water
  off a wild shore or on a wild lake. On the v3 world: 179,528 open spots, 1,204 rough, 8,864 in the water.
- Near the base you signed on at (sar.js pick): of four spots drawn within 1,400 - 24,000 px of the base (SAR.dist,
  SAR.draws), the nearest - none of the kind that near (no rough ground by the airport), someone hurt on open ground
  near it instead. Signing on at a base's pad (Act there) starts the shift there; the phone's job list offers the
  nearest base.
- test/world3scenes.test.js: the five bases built, each in its region with its pad, far apart; signing on at each one's pad starts
  the shift there and its calls come near it; every call spot in a wild district. test/jobway.test.js: the same rules on
  today's city (no park, no town), pick within reach of the base.

### Numbers
- Page code: 498.1 KB of the 498 budget (the arrow and its drawing load with the first job: client/jobway.js); the
  renderer untouched.
