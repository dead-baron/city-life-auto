## 2026-10-23 - The owner's shipping-fixes notes, batch 2a: shadows in the air, the water, the train, the camera phones, the skate parks

Seven of the owner's notes (fix-pdf pages 10, 17-19, 21, 24 and the text). Pictures: the session's scratchpad `b2a/before`,
`b2a/before2`, `b2a/after`, `b2a/after2` and `b2a/after3` (a local World v3 server in dev mode, art v2 in headless Chromium,
13:00).

**Aircraft shadows** ("Shadow of helicopter looks like placeholder art", "Shadows on air vehicles could look better"). The
overlay drew an ellipse and a bar for a helicopter, three bars for a plane. Now `client/render/aircraft.js airShadow` draws the
aircraft's own shape seen from above, as `client/art2/aircraft.js` builds its models: a helicopter's cabin, the tail boom
tapering to the fin and tailplane, the skids on their struts, the tail rotor edge on, the gunship's stub wings, rocket pods
and chin gun; the plane's fuselage, the high wing foreshortened as it banks (nine steps), tailplane, fin, gear and struts, the
crop duster's boom. Each shape is drawn once into a mask and box-blurred to one of four softnesses by height, then kept. The
shadow lands away from the sun by the drawn height, the way the renderer's shadows fall (atmos.js `sunDir`, `shadowLen`,
clamped so a low sun doesn't throw it miles off). It fades with height, at night and in the rain. On a helicopter the rotor's
spinning disc is a faint ring, with its blades while it spools; on a plane the propeller is a faint line. The renderer's own
shadow of the model (the march) is kept only for an aircraft on the ground (under 6 px; it was under 40). Off the ground the
march made a column of it, and the overlay's shadow had been held back below 70 px, so a helicopter hovering low had next to
none. The overlay now takes over from 3 to 11 px. Pictures: `after3/rescueheli-town.png`, `heli-town.png`, `gunship-town.png`, `after/plane.png`,
`duster.png`, `policeheli-mid-water.png` against the same shots in `before/`. Also `after3/wash-sheet.png`, the helicopter at
18, 70, 130 and 300 px. The masks on their
own are in `mask/masks.png`.

**Birds' shadows** ("Eagles cast a full shadow that drapes down"). The shadow march takes anything drawn up off the ground as
a column down to it, so a soaring eagle threw a long band. Now a bird up in the air casts nothing in the march. Instead
`host.js _flyShadow` lays a dark decal of its shape on the ground below it (`birdShadow`: the body, the tail's fan, the wings
swept back and narrowing; spread, half up or tucked in a stoop by the wingbeat, sized by species - `SPAN`). The decal is offset
away from the sun by the bird's height and fades with height, at night and in rain. This covers the wild birds (eagle, osprey,
heron, geese, ducks, quail, pheasant, turkey) and the town's pigeons and gulls in flight. Pictures: `after/eagle-1-z.png` and `after2/eagle-2-c.png`
(contrast raised) against `before2/eagle-*.png`.

**Water under a helicopter** ("a weird effect happening even when you're high up"). There was no rotor wash. What reacted was
the water life (`art2/game/waterlife.js`): every vehicle over water counted as a mover in it, so the fish scattered and dived
under an aircraft at any height. Now an aircraft up high is nothing to the water. A helicopter below `WASH_H` (150 px) blows
the water about. The strength is `washK`, from 0 at 150 px to 1 at the surface: rings spread from under the rotor, and spray
and foam blow outward past its tips. Only when it's low enough (k > 0.3) does its wash scatter the fish. Pictures:
`after3/wash-18-b-z.png` (spray and rings round it, the shadow and the rotor's ring under it) and `after3/wash-sheet.png`
(nothing on the water at 130 and 300 px); `before/heli-low-water-z.png`.

**Blood in water** ("a static image, maybe we have a new VFX"). Blood landing on open water (render/fx.js `decal`, types 1 and
5 but not the oil slick) no longer leaves a stain on the surface. It becomes a cloud in a pool of 48 (`fx.bc`). Art v2 draws it
in `waterlife.js blood`: a few dithered wisps round where it went in, each turning slowly its own way. They bloom out over the
first seconds, drift with the current (shared/flow.js `flowAt`, or a little with the wind on still water) and thin out over
8-18 s, under the surface like the fish. A cloud washed ashore is gone in a second. The classic renderer draws a fading,
spreading disc. Pictures: `after/blood-sheet.png` (0, 3, 7, 12 s) against `before/blood-sheet.png` (a
still stain). Not seen on the page: the drift with a river's current. In the live run the page's World v3 map had no `waters`
(`S.map.waters` undefined, though `river` had 11477 tiles), so `flowAt` is null everywhere on the page and the clouds only
drift with the wind. That gap also affects the page's own prediction of swimmers in a current (physics.js) and is worth a
look. The current itself is covered by the test.

**Riding a train** ("the other NPC riders and the player will jitter a bit"). The engine snaps every sprite to the 2 px art
grid on its own. The car and each rider in it had different fractions, so they snapped at different moments and the riders
shook a pixel against the car. A simulation of the engine's rounding: a seated rider's drawn offset from its car changed on
1146 of 1800 frames before and on 0 after. The riders were also lifted by the ground's height under them (kerbs, sidewalks)
as the train rolled over it. Now (`host.js _ped`, `car`) a train's riders are drawn from their car's spot plus their place in
it in whole art pixels, at the car's height. While you ride, the camera follows that drawn spot too, so the train and its
riders hold still on screen together. Logged in-game, frame by frame while the train runs:
`before2/train-log.json` shows seated riders whose drawn height against their car jumps 8 px back and forth (24, 16, 24) as
the train crosses kerbs. `after/train-log.json` shows each seated rider's drawn offset from its car the same in every frame.

**Taking a picture through a wall.** A passer-by stopped to film something (npc.js `spectacle`, the panic's filmers) wherever
they stood, which could be pressed against a shop front with the thing behind the building. The selfie-takers' spot by a
landmark could be facing a wall, and the tourist pair's other half was put 14 px to the side without a look at what was there.
Now `personas.js filmFrom` sets the rule: open ground (nothing solid within 20 px) and a clear line of sight to what they film.
Filming starts only from there. The selfie spot must pass it both toward the landmark and the way they face. The other half of
a pair stands where there's open ground, or doesn't come. The owner's exact case wasn't met in the live runs (`before2/` and
`after/photo-all.png`: the selfie-takers on open ground by a fountain either way); the wall case is in the test.

**People walking through the skate park.** Wanderers picked waypoints across it like any open ground. Now (`npc.js skateAt`,
`skateCrossed`, `skateOff`):

- A wanderer's next waypoint is never on a skate park (map.skateSpots, a 12 px margin) nor across it.
- Someone who finds themselves on one heads off it the nearest way and doesn't stop to idle there.
- Nobody is spawned on one.

The skaters, the friends sitting on the ledges and those hanging out (the activities.js 'skaters' spot), and a skater
persona on a board are left to it.

Tests: `test/passersby.test.js` (new): the skate park - nobody wandering walks onto it in 40 s, those put on it are off it in
25 s, and it fails with the waypoint rules taken out. Filming - not from against a wall, not through a building, yes from open
ground; a spectacle behind a building isn't filmed through it. `test/waterlife.test.js`: the downwash (nothing at 400 px, none
of the fish bothered; rings and spray low, more at 20 px than at 110) and the blood (no stain on water, a stain on land as ever,
the cloud blooms, thins, drifts downstream on a river's current and is gone). Also run: phones, npcpeople, activities,
aircraftart, flight, policeair, skate, trains, dmath, mapwindow, pagemodules, lazypage, view. The page's code is 497.4 KB
(budget 498): the hooks on the page are two lines (fx.js's water check, main.js's `S.fx.water`). The drawing is in modules
that load when needed (render/aircraft.js, art2/game/waterlife.js). The renderer is 397.4 of 400 KB (the bird shadows and the
riders in host.js).
