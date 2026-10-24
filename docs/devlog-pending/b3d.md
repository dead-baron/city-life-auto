## 2026-10-24 - b3d: the corner by Midtown station stays clear (test/calmstreets.test.js on batch 3)

### What locked it
Batch 3's run of test/calmstreets.test.js (a player standing still by Midtown station for eight minutes) had 14 cars
stuck round the player at the worst, 8.2 on average (the limit 10 and 3; batch 2: 0.7). Traced headless: no batch 3
change touched that corner - the station block's roads, props and buildings are the same tile for tile in batch 2 and
batch 3 (the only fence near is the coffee shop's yard fence, there in batch 2 too), and the traffic round the player
is as dense (8-12 NPC vehicles within 20 m, about 300 entities, in both). The run isn't the same twice, and batch 3's
changes drew one that hit three locks the traffic code already had, all at the bend where the street past the station
turns south (one street - one edge, a lane each way - round a tight corner):
- a pickup turning the bend stopped for a bike parked at the station's bike rack, on the pavement: the look-ahead box
  (traffic.js obstacleSpeed) is straight ahead of the car, so on a bend it sweeps over the kerb, and a wide car's
  reached the bike. Parked bikes never move: the pickup stood in the bend for good, the queues behind it both ways locked
  the corner, and the cars that turned round to get out made it worse (most of the 14);
- out of the bend a car aimed straight at its next waypoint - the far end of the street, 17 tiles on - so a car that
  swung wide on the corner drove most of the street half in the oncoming lane, and met a tanker coming up it nose to
  nose;
- the two of them, a car close behind each: breakRing (a ring of cars each stopped for the next) backs off the one in
  the ring with room behind it, and neither had any - they waited for ever.

### The fixes (server/systems/traffic.js)
- obstacleSpeed: a vehicle nobody's in, standing still wholly off the roadway (a bike at a rack, a car left up on the
  pavement - parkedOff: its middle and corners on no road, bridge or car park) isn't in a car's way; the lanes never
  leave the road. Remembered while it stands where it is.
- lookAhead: a car off the line between the waypoint it last passed and the next one by more than 8 px (swung wide out
  of a corner, eased over for a siren, nudged in a jam - up to 3 tiles) looks ahead along that line from the nearest
  point on it, so it's back in its lane within a car's length or two. Only while the waypoints are the ones it passed
  that one on (a lane change, a new road, a turn round: as before).
- breakRing -> makeRoom: when nobody in a ring has room to back off, the car queued behind one of them with the most
  room behind it (an NPC's) backs off first - then the one in front of it can, the next time round. world.ringRoomMade
  counts them.

### Checks
- test/calmstreets.test.js passes (run after each fix). Its steps, run headless with a trace, vary from run to run;
  batch 2: 0.7 cars stuck on average (7 at the worst); batch 3 before: 8.2 (14); with the first fix only: 3.8 (13 -
  the tanker); with the first two: 4.4 (14 - two more nose-to-nose pairs, at the west bend and the junction by the
  station, neither with room behind) and 0.3; with all three: 0.2, 0.4 and 0.3 (3, 7, 7 at the worst).
- test/trafficwalls.test.js: a bike parked on the pavement beside a car's way doesn't stop it (one in the road does);
  two cars nose to nose with a car close behind each - one of those behind backs off.
