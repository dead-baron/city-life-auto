## 2026-10-25 - Batch 7a: the bathhouses you walk into, car soccer at the Waves Arena

Two of the owner's planned features from his 10-16 notes ("first get in the features we've already got planned"):
"Bathhouses and locker rooms with usable showers; NPCs going through the routine" and "Rocket League-style car soccer
arena (boosts, banked walls, a giant ball)".

### The bathhouses (server/systems/bathhouse.js, shared/homelayout.js 'bath')
- **Both of World v3's bathhouses open up**: the Steam & Stone Baths in the Arts District and the Old Quarter Baths
  (their POIs are marked `bath`: shared/world3-arts.js, world3-oldquarter.js, world3-hand.js). The door ("Into ... - the
  bathhouse ($8 at the desk)") opens onto a floor of its own, the way an arcade's does: walked round by homeinside.js,
  drawn by client/render/homeview.js and homeart2.js, open to anyone, other players in there with you. Not with the
  police watching (wanted, the door takes its moment).
- **The plan** (25 x 14 tiles): the lobby with the front desk, the towel shelf behind it and the attendant; the men's
  locker room to the west and the women's to the east, each through its indigo or red curtain (noren); in each, the
  lockers, a bench, four wash stations along the back and the basins; through a doorway at the back of each, the bath
  hall - the big tiled bath in its timber rim, the hot stones in the corner, benches, paper lanterns.
- **The routine, for you:**
  - the front desk: a day at the baths, `BATH.fee` ($8) - a towel and a locker. The curtains (`X` in the plan) hold you
    back until you've paid: shared/homelayout.js `blocked` lets the paid through (`s.pass`), and the page predicts the
    same.
  - the lockers: change into your bathing suit (and back); leave your weapons in it while you bathe. They're kept on
    your profile (`bathLocker`), so a restart can't lose them, and they're back with you, every round, as you leave.
  - a shower (in your bathing suit): `BATH.showerS` s on the wash station's stool. It washes off the blood and the dirt,
    stops the bleeding, puts out a burn, clears the red footprints and gives a little health back.
  - the bath (a shower first - the house rule) or the steam by the hot stones: you sit in it and get health back a
    little a second; stay `BATH.soakS` s and you leave refreshed - stamina comes back faster for `BATH.buffS` s (as a
    coffee does: the self record's regen flag, so the page predicts it).
  - the benches: sit down. Out by the door.
- **The city's people go through it too** while anyone's in there (at most `BATH.bathers`, a new one about every
  `BATH.arriveS` s): in by the door, a word at the desk, through their curtain, changed at the lockers, a wash on the
  stool, a soak in the bath, back to the lockers, dressed, out. Four are already partway through it when you come in.
  Their looks come from the look system (shared/look.js `randomLook`); changed, a man is in swim trunks and a vest and a woman in
  a swimsuit (`suitOf`) - nobody is ever in less, as the nudity setting is still an open question. Your own bathing suit
  keeps your face and hair. The page gets them as `m.folk` and their looks once each (`m.looks`).
- **Blood and dirt on people** (server/systems/grime.js): nothing like it existed (only bleeding and the red
  footprints), so there is a small state now - `ped.grime { b, d }` on players. Blood comes from a hit's share of your
  health, and more from killing someone up close; dirt comes from a tumble along the ground. Swimming washes it off;
  rain washes the dirt off slowly. Covered in blood out in the street, people stare and step back (npc.js `backOff`),
  and an officer who sees you grows suspicious (law.js's hidden suspicion, at most once every `BATH.eyeS` s - never a
  star on its own). You're told when it happens. Any shower - at home or at a bathhouse - washes it all off. It isn't
  drawn on the character (that would be the renderer's code, which is full).
- **The art**: client/art2/props-bath.js (new, loaded only with the inside's art): the timber desk with its bell and
  register, the towel shelf, the lockers with their brass plates and keys, the slatted benches, the wash stations (the
  tiled panel, the shower head, the mirror, the stool and the bucket), the bath, the hot stones glowing over their
  coals. The walls are timber, the wet rooms tiled; the steam rises off the bath and the stones; the lanterns light it
  at night. The classic view draws them too.
- **Numbers**: shared/rules-play.js `BATH`. (The brief said shared/rules.js, but every page loads that file and the
  page's code is full: the numbers for what the server plays out go in rules-play.js, as the police dogs' do.)

### Car soccer at the Waves Arena (shared/carsoccer.js, server/systems/carsoccer.js, client/carsoccer.js)
- **The arena** is new (nothing in World v3 was waiting for it): east of Stadium Way, by the water, in the middle of the
  RV lot across the ring road from Waves Stadium (shared/world3-stadium.js `arena`: the biggest box that fits, 54 x 34
  tiles there). A wall all
  round; at each end, past the goal line, the goal's box (three tiles deep, ten across) in the back wall; inside, the
  pitch (1472 x 1024 px of play) with banked walls 96 px wide along every side but across the goals' mouths. The ground
  bake lays the turf in mown stripes, the banks' concrete darker toward the wall, the goal boxes in their team's
  colour and a pitch's lines (client/art2/game/groundbake.js `venues`). A stand with its crowd runs along the north
  side, floodlight masts stand at the corners, and the gate's two signs (WAVES ARENA, CAR SOCCER) face Stadium Way.
  m.arenas holds its shape (`arenaOf`); nobody of the city spawns on the pitch and nobody parks in it.
- **The banked walls**: a car on a bank is pulled back down to the pitch (`carStep`, `bank.g` at the top). It runs in
  every vehicle step (shared/physics.js `setArena`, a hook like the skateboard's): the server's and the page's
  prediction alike, so the prediction never fights it. Coast up one and you climb, stop short of the wall and roll back
  down. The renderer draws the car up the slope (m.jumps' `bank` ramps: client/art2/game/jumps.js gives the ground's
  height there, never a flight).
- **The giant ball** (`stepBall`, 88 px across - about a car's length - and all of it fits in a goal's box): the
  server simulates it after the
  cars have moved, two steps a tick. It flies and bounces off the floor, rolls back down the banks, bounces off the
  walls and the goals' posts, and is shoved by the cars. A car is far heavier, so the ball never slows a car (and the
  page's prediction of its own car stays right); it comes off a car livelier than the car was going, with a kick on
  top, and a hard hit lofts it. It's a goal once the whole ball is over the line.
- **Boost**: the Sprint button at the wheel (Shift; RT all the way down; the thumb all the way out) pushes the car on
  while there's boost. It drains while held; the pads on the pitch fill it - six big ones (all of it, back 10 s later)
  and eight small ones (a little, back in 4 s). The server says whether there's boost (`v.bok`; the page's own car
  `local.bok`, from the server's word).
- **A match**: join at the gate on foot ("Join car soccer at Waves Arena"). The first to join opens the lobby; 20 s
  later the players split between ORANGE (defending the west goal) and BLUE (the east), and the city's drivers fill
  each side to 2 (up to 3 a side with more players). Everyone is put at the wheel of a Zipper GTi in their side's paint
  on the kick-off spots. Kick-off holds the cars 3 s (the page holds its own too). Then 3 minutes of play on the clock,
  which stops for goals and kick-offs. A goal shows the scorer and the replay of the ball's last 3 seconds and throws
  confetti for 4 s, then it's kick-off again. Most goals wins. A draw goes to overtime, where the next goal wins (60 s
  of it at most, then it's a draw). Full time pays $150 into the bank of each player on the winning side; after 8 s
  everyone is out at the gate on foot, and the arena cars and their drivers are gone. The vehicle button leaves the
  match (out at the gate; one of the city's drivers takes your car); so do dying and logging off. With nobody left
  playing the match is off.
- **The city's drivers** go round behind the ball onto the line to the goal they're attacking and drive through it,
  boosting on the straight; a side's second driver hangs back in front of its own goal until the ball comes its way
  (`drive`, traffic.js `driveToward`).
- **In there**: the arena's cars never take harm, their knocks are no crime, and nobody shoots from them.
- **The page** (client/carsoccer.js, loaded with the server's first word near the arena - the 'soc' message, sent to
  everyone within 2600 px): it predicts the ball between the server's words with the same physics against the cars as
  they're drawn (your touch shows at once) and eases it back onto the server's ball. It draws the ball (shaded, its
  panels rolling, its shadow up the banks), the goals' frames and nets, the pads lit or spent, the scoreboard with
  both scores and the clock, the countdown, GOAL! with the scorer and the replay's trail, FULL TIME, your boost, and an
  arrow to the ball when it's off the screen. The 'goal' event plays the goal sound and shakes the camera.
- **Numbers**: shared/rules-games.js `CARSOCCER` (out of rules.js, which the page loads, for the same reason).
- **Not done**: no jump or flip; no cars' height off the ground for the ball (it sails over a car once it's higher than
  one); one arena.

### Debug menu (server/dev.js, client/devcats.js)
"Bathhouse" and "Car soccer: the arena's gate" (`near`), "Car soccer: a match now" (`soccer`: msg.score, msg.ball,
msg.play), and `bath` (into the nearest bathhouse: msg.at lobby / lockers / showers / hall / soak / steam, msg.side,
msg.suit).

### Tests
- test/bathhouse.test.js (new): the plan - the desk and the door before paying, everything in reach after; a whole visit
  (held at the curtain, the fee, changed, the shower washing the blood and the dirt off and stopping the bleeding, the
  soak, refreshed, out); the house rules and the locker keeping your pistol, every round back on the way out; a bather
  through the whole routine in order (a shower, then the bath; changed and back; dressed in the lobby) and every suit a
  bathing suit; nobody simulated with nobody in there; grime from a beating and a tumble, the officer's suspicion
  without a star, washed off; the art builds and lights, none of it in the page, the renderer or the bake.
- test/carsoccer.test.js (new): the arena's shape; the ball off the walls, the posts and the banks, into both goals,
  off a car faster than the car; a car up a bank and back down, the boost (the page's step the same), the kick-off
  hold; a match from the gate to full time (the drivers filling the sides, a goal and its replay, kick-off again, the
  prize, everyone out at the gate, the cars and drivers gone); overtime's golden goal, no harm and no crime, leaving
  with the vehicle button; the gate during a match; the page's flags and its ball between words.
- test/world3server.test.js: both bathhouses' doors lead onto their floors; the Waves Arena by the stadium - walled in,
  nothing solid or parked on the pitch, its gate by a street, the banks' ramps, a match played on it and a goal.

### Budget
- Page 498 KB (498.4: the 'soc' message's loader and the draw hook in client/main.js, the vehicle-step hook in
  shared/physics.js - everything else loads later); renderer 401 KB (401.4: the bank ramps in jumps.js).
- **Raised: the bake worker's code, 905 -> 906 KB** (905.6). The arena's ground - the turf, the banks, the goals' boxes,
  the lines - is baked with the chunk like every pitch's lines (groundbake.js `venues`), about 0.45 KB; my comment was
  trimmed first. The ball, the pads, the goals' frames and the HUD are client/carsoccer.js's, not the bake's.
