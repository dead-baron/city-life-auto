## 2026-10-24 - Batch 4c: skateboards you find and leave lying about, the walk-in arcade

### Skateboards are vehicles now (the owner: "people will always be using skateboards to get around faster ... just making it like other vehicles would work best")
- A skateboard is a vehicle lying on the ground (shared/vehicles.js 'skateboard', i 52: kind bike, pedal, board), not a
  thing in your bag. The bag's skateboard, its quick button (B, D-pad down, the touch 🛹 pill) and its use from the bag
  are gone (shared/items.js, shared/controls.js, client/main.js quickBoard, hud.js, input.js, style.css, index.html).
- Where they lie (server/systems/skate.js boardSpots, worked out from the map at run time - the world's hash doesn't
  change): a rack of three at each skate park (on its smooth ground, clear of the ramps, the rails and the benches,
  the first run found from its south edge), two by the skate shop (Kickflip Skate Co.), one by most surf shops and by
  half the boardwalk's places, one at a campus (World v3 has none yet). Never on a road or a bridge, never on grass,
  never indoors. In World v3: 12 at the four skate parks and a handful elsewhere. They're put out round a player where
  nobody's looking, as the shopping carts are (skate.js setOut), free to take.
- The vehicle button by one (the prompt: "Get on the skateboard") steps you on: the board is taken up off the ground
  (vehicles.js tryEnter -> skate.js mount) and you ride it as before - the push, the carve, the ollie, every trick,
  the ramps' surfaces and the quarter pipes (shared/skate.js rampSurface, map.js qpipeSolids: unchanged), the sessions.
  The vehicle button again steps you off and leaves it at your feet (beside you, on your level); by a car it's off
  the board and into the car. A bail throws it ahead of you and it lands 1.2 s later where it stopped (short of the
  wall); into the water it's gone. A park's board left lying is nobody's: traffic.js clears it once nobody's about,
  and its rack fills again; while it's ridden its place stays empty.
- The board's speed (shared/board.js BOARD): push 330 -> 270 px/s, pushHard 380 -> 315 - under every bike's top speed
  (the commuter's 330, the beach cruiser's 290), so it's a short hop and a trick ride, not a way across town.
- Your own board: bought at a skate shop, a surf shop or a sports shop ($85, "Skateboard": skate.js shopOptions), set
  down by the door - outside a walk-in shop. One at a time (profile.board): after that the shops (free) and your home's
  menu offer "bring it out" - the one lying about anywhere else goes first, never two. Taking someone else's is bike
  theft. Left lying more than 2,000 px from you, or when you log off, it goes home (skate.js tidy, with a word about it).
- The old bag's board, a fair swap (skate.js convert, on joining): a skateboard in your bag becomes your own board -
  out of the bag and the quick wheel, profile.board set, a note saying where to take it out. Chosen over a refund: you
  paid for a board, you keep a board. The arcade's 500-ticket prize is now a skateboard of your own too.
- Both renderers draw a board on the ground: art v2 a voxel model (client/art2/vehicles.js 'skateboard'), the classic
  view the bail's board sprite (main.js drawVehicleEnt). client/skate.js loads when a board's in sight.
- Debug menu: "My own skateboard, beside me" and "The nearest skate park's rack of boards" (server/devplay.js).

### The arcade you walk into (the owner: "The Arcade should be a building that has an interior you walk into ... the prize counter should be somewhere inside")
- Every arcade's door - the Neon Strip's (Retro Rewind, Hi Score, VR Den, the Pixel Arcade, the Koi, the Nightfall,
  Ultra Games), the Pier Arcade, the two Game Zones, Midtown's Penny Arcade: the 11 POIs arcade.js isArcade finds in
  World v3 - opens onto its floor: a level of its own as a home's or a block's lobby is (shared/homelayout.js 'arcade',
  walked round by server/systems/homeinside.js, drawn by client/render/homeview.js and homeart2.js; one floor per door:
  arcade.js hallOf, ids from ARC0). Open to anyone, others in there with you; not with the police watching (wanted and
  out of sight, the door takes its moment, as a lobby's).
- Inside: a cabinet along the back wall for each arcade game (STARFALL, skee-ball, pinball NEON NIGHTS, air hockey -
  arcade.js GAMES): walk up to one and Act puts in its credit and plays it on its own screen (the minigame flow and
  client/arcscreen.js as before). Down the east wall the prize counter (G: a glass case of prizes lit from inside, plush
  toys along it - client/art2/props-home.js prizeCounter, homeview.js): Act there for the prizes and your tickets.
  Out by the door into the street at the arcade's door.
- The menu at the door with the credits and the counter is gone: a menu opened at an arcade some other way offers only
  "Go inside".

### Tests
- test/skate.test.js: a board on the ground, on and off with the vehicle button (taken up, left at your feet), the prompt;
  no board no ride, not on grass, the water or indoors, off the board into a car; the bail's board landing; slower than
  the bikes; the boards set out (a rack of three at a park, side by side, never on a road, filled round a player, free,
  its place empty while it's ridden, gone once nobody's about); your own board bought and set down by the door, one at a
  time, brought out, theft, gone home when left; the old bag's board converted.
- test/arcade.test.js: in at the door, a cabinet for every game and each in reach, a different game at each, a credit
  played and its tickets, the counter walked up to and a prize redeemed (the skateboard prize set down by the door), out
  by the door; open to two players, not with the police watching, every arcade's door leads onto a floor.
- test/world3server.test.js: World v3's racks at all four skate parks, a sparse few elsewhere, none on a road; every one
  of its arcades' doors leads onto its floor. test/devplay.test.js: the new debug buttons.
- Page code 497 KB of 498 (the board's vehicle in; the quick button, its pill and the bag's board out); the renderer
  399.9 KB of 400 (the board's model in, a few of art2/vehicles.js's comments shorter).
