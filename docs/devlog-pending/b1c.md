## 2026-10-23 · b1c: riders' outlines, the skate park's quarter pipes, ghost trains, bridges, the desert's red patches

**No see-through outline on anything ridden in the open** (the owner: "Player is showing a white outline in some
vehicles like boats or shopping cart or on trains", "on a dirtbike this time", on a horse). The outline was the
vehicle's own x-ray (art v2's engine draws the parts of your own sprite hidden by something taller over the frame): the
rider drawn on top of a bike, a cart, an open boat or a horse stands taller than it, so the vehicle's shape showed
through the rider. Now nothing ridden in the open is x-rayed (bikes, carts, boats, jet skis, horses), nor anyone seated
on something (a train's riders, a cart's passenger), on a skateboard or a surfboard; your own car (rider hidden inside)
still shows through the buildings that hide it (client/art2/game/host.js _veh, _horse, _ped). Test:
test/ridexray.test.js.

**The skate park's quarter pipes** ("you can just walk through the quarter pipe ... when riding on skateboard it shows
you going transparent through the quarter pipe instead of being in front of it"). A quarter pipe was no obstacle at
all: you walked or rolled into it at ground level and sank into its curve (the art in front of you hid you, the x-ray
outlined you). Now:
- its deck and the tall part of its curve are solid (two rows of posts across it: shared/map.js qpipeSolids) - you're
  held at its low toe on foot, rolling into it slowly, or from the sides;
- rolled up hard (the quarter pipe's air: shared/skate.js) you pass its posts and go up the face as before - but never
  on past the coping into the deck and the wall behind (fast, the rest is straight up over it);
- anyone on a ramp is drawn on its surface, not sunk into it: the page lifts a rider or a walker by the ramp's height
  where they are (shared/skate.js rampSurface - the quarter pipe's curve, a kicker's slope, a pyramid's banks, as
  client/art2/props-park.js shapes them; client/skate.js rampAt, client/main.js pedLook);
- the NPC skaters' laps keep off the quarter pipes (server/systems/activities.js).
Test: test/skate.test.js (on foot and slow held at its face, fast up to the coping and back with no bail, the surfaces).

**No ghost train at the stations** ("Train stations showing train art stopped at station and you pull into it and then
through it"). A World v3 train nobody is near runs without placing its cars (docs/WORLD-V3.md 8.23), so its cars stood
where they were last placed - the platform it started at when the server came up, or where the last player left it -
long after it had gone, and anyone coming by saw (and rode through) a train standing there. A player near a train's
cars as they stand now counts as near it too: the tick they are, the cars go to where the train really is
(server/systems/trains.js nearSomeone). Test: test/world3rail.test.js.

**Bridges** ("Helicopters can fly through bridges", "Boats can be seen between the streets on a highway bridge and their
VFX show up over the bridge, and the boats seem to be able to hit you", "Water VFX visible through bridge"):
- a boat under a bridge no longer hits people up on its deck, nor a car on the deck a swimmer under it
  (server/systems/vehicles.js: the deck and the water under it are two layers, as acrossBridge already said for
  getting in);
- a boat's foam under a bridge is hidden by the deck like its hull (the bow wave capped below the deck; the trail's
  foam not drawn on a bridge's tiles), and so are the fish, the rings and the swimmers' wakes (client/art2/game/host.js,
  waterlife.js);
- a helicopter below a bridge's deck flies into its side - the elevated highway's (134 px up, where art v2 draws it)
  and a road bridge's over the water (14 px, its parapets); above it, over it; one that lifted off under a deck gets out
  as it likes. Helicopters only: planes low over a highway are on their approach (shared/flight.js collideAir).
Tests: test/bridgelayers.test.js, test/flight.test.js.

**Walking on bridges and piers** ("Fell through the bridge here in the red rock desert", "Walking bridges are bugged,
should be easier to walk on bridges and stairs without clipping through"). A player can swim, so their step let them
walk off a bridge's deck or a pier's planks straight into the water beside it - near the parapet, or on a footbridge or
a creek's plank bridge a step to the side. On a bridge's deck or a pier the water beside it is now behind the railing;
a dive roll still jumps in (shared/physics.js pedStep). Test: test/bridgelayers.test.js.

**The desert's flat red patches** ("Can't walk through this shadow in the red rock desert?", "Can't walk through this
patch either, looks like incomplete environment asset"). The relief's cliff bands (shared/world3-relief.js) are solid
rock, and only a band's south-facing run gets a face (the cliff sprite); in the desert the rest - a coast's drop facing
the sea, a band's east or west side, a short arc - was drawn as flat red ground (groundbake.js REDROCK) you couldn't
walk on: squares and strips of it by the coasts (seed 1337: 4608,666 and 4659,666 on the north coast; 5912-5940,
1576-1616 on the east coast). The desert's band tiles with no face over them are their ground again (the slope's
shading stays); what a face stands on stays rock. Test: test/world3relief.test.js.
