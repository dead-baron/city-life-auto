## 2026-10-24 - b3d, part 2: the streets by Midtown station keep moving, whatever the day brings

### Still locking on the merged batch 3 (e952ccfc)
The suite's run of test/calmstreets.test.js on the merged batch 3 (with b3c's shops) had 17 cars stuck at the worst,
7.4 on average. The run isn't the same twice: the world's day (server/world.js: `day` from the clock, a new one every
20 minutes) and a few other things change it from run to run - so it was sampled, the test's own steps run headless
for a dozen days in one build (a day each: World's `day` option). On e952ccfc, 3 runs in 12 failed. The jams were round the same
block - the street past the station that bends south at both ends (one edge each, a lane each way) and the junction
in the middle where the wide road from the south comes in - and they were on:
- a flatbed parked in the last kerb bay before that junction: the bay is a car's length from the street across, the
  flatbed's nose stuck a tile and a half out into it; the cars coming round the bend stopped, turned round in the
  junction to get past and locked it (the cars parked there are drawn at random - a sedan or a hatchback most days);
- long vehicles on the bends: a mixer, a garbage truck, a tanker coming round them the two ways at once - a long one
  sweeps the other lane on a bend that tight, and the other way's car was in the bend with it;
- two cars nose to nose, one in the other's lane (out of a bend, round in a turn), a car close behind each: backing off
  and coming on again only met it again (the ring broken 14 times in one run), and with no room behind either of them
  nothing broke it at all.

### The fixes (server/systems/traffic.js)
- bayRoom: a parking spot in the road takes a vehicle only as long as the kerb runs beside it - along it both ways,
  until the tiles past its kerb side are road too (the junction's mouth, a side street). Too short for the one drawn:
  a sedan or a hatchback instead, or none. Worked out once per spot.
- bendHold: the tight bends of a street with a lane each way (a turn of more than about 50 degrees in one point) -
  a long vehicle (100 px or more: a van, a lorry, a bus) coming up to one claims it; the other way waits short of it
  till it's round, and it waits short while someone the other way is in it. A claim lapses when its vehicle is round,
  gone, or held up 8 s with nobody in the way in the bend (stuck in its own queue: the other way isn't kept waiting),
  and that one doesn't claim that bend again for 20 s.
- sidestep: two cars nose to nose (a ring of two), one at least 20 px further off its own lane's line than the other -
  that one edges back over into its lane at a crawl past the other (40 px/s, not braking for that one for 4 s). Two
  as far off as each other back off as before (breakRing: the one with room behind it), and if they meet again within
  30 s the one further off edges over. Tried twice; after that, backing off and making room as before.

### Checks
- The test's steps, sampled: on e952ccfc 3 of 12 days over the limit (average stuck 0-4.9, worst 1-11); with the
  fixes 0 of 16 (average 0-0.4, worst 1-5). The same scenario by five other stations (Metro Central, Old
  Quarter, Northgate, Southside, Westport Center, two days each), on the fixes before the sidestep's last change
  (it first edged over even for two as far off their lanes as each other): none over, the worst 10 at Northgate.
- test/calmstreets.test.js three times, all passing: 0.1, 0 and 0 cars stuck on average, 4, 1 and 1 at the worst (it
  reports its numbers now: a diagnostic, passing or not). trafficwalls, reroute, stops, bikes, roadends, transit,
  ems and police: 67 pass.
- test/trafficwalls.test.js: a car out of its lane nose to nose with one in its own edges back and they pass (the
  make-room test now starts after the sidestep's tries); a tanker and a car round a tight bend the two ways both get
  round, the tanker's claim seen; a kerb bay at the street's end takes a car, not a van or a flatbed.
