## 2026-10-24 - Batch 4d: the cinematic mode's drift controls and follow scenes

The owner: "Can cinematic mode have more controls for the camera like choosing which direction the camera drifts at and
the speed it drifts at? Can we set up automatic scenes that has the camera follow NPCs like in cop chases or street
races or fishing or surfing (or every activity and stuff we've established so I can take some cinematic shots of
everything, anything that can be automated with NPCs would be great.)"

### The drift, steered
- client/director.js: the Drift camera has a way (8 ways from the panel's compass, or any angle on the dial - drag
  it) and a speed (Off, Crawl, Slow, Steady, Quick, Fast: 0-170 world px a second at the zoom of 1, slower across the
  world further in), kept from one drift to the next; a new speed or way eases in. WASD / arrows / the left stick steer
  it (it turns toward the way held), Z / X or LB / RB slower / faster, Space stops it and starts it again, Q / E or
  LT / RT zoom, Esc / B back to you. While drifting the keys are the camera's (your character stands still).
- The bar along the bottom (#cine-ctl) holds the drift's dial, speed and zoom (the follow scenes' kind, Next, Tour and
  zoom). It shows with the HUD; on the clean screen it's hidden, and comes back for 3.5 s when you press a key or a
  pad button, move a stick or the mouse, or touch the screen - then fades for the shot.
- On a pad, while the camera has the controls: Y the panel, X a picture, B back; the bag, the quick wheel and the
  weapon wheel stay shut (client/main.js: `ch`).

### Follow scenes
- shared/cinekinds.js (new): 36 kinds - Action (police chase, street race, armored truck, gang shootout, street fight,
  purse snatcher, biker club ride, police on patrol, police helicopter, ambulance call), Vehicles (traffic, city bus,
  taxi, main-line train, ferry, boats, a plane taking off or landing, the news helicopter), Country (combine
  harvesting, horse rider, wildlife, shark, hunter, hikers / rangers / climbers), Fun (anglers, surfer, skaters, pickup
  basketball, pool, dancers), People (chess, picnic, painter, diners, street corner life, street characters) - and the
  tour's order (the action between the quiet ones), CINE_TOUR_S 45 s a kind, CINE_SUBJECT_S 120 s a subject.
- server/systems/cinefollow.js (new): the page asks `{ t: 'cine', f: kind | 'tour' | 'next' | 'stop', near }`; the
  server finds who's doing it from the systems' own state (streetlife's events, the police's targets, the shootouts,
  the happenings, the activities' groups, the personas, the flights, the buses, taxis, ferries, trains, boats,
  animals) - an NPC, an animal, a train or an aircraft, never another player - near you first (9 km) or anywhere, and
  tells the page `{ t: 'cinef', id, k, n, z, cut, x, y }`: whom to follow (the vehicle they're in), what to call it,
  how wide, cut or glide. When their activity ends it moves on: the same scene's next first (the next racer in the
  race), else another of the kind; the tour moves on to the next kind (and after 45 s anyway). Nobody at it: in dev
  mode one is started where that's cheap (a street race, a chase, an armored truck's run as the debug menu does, a gang
  shootout, a street fight, a purse snatch, a plane on the nearest runway, an activity's spot filled, a street
  character), at most once a minute a kind; otherwise the kind is skipped (the page says so and it keeps looking).
- Its own actors, for what nobody does on their own yet: a combine harvesting a field (two ripe rows a pass, down and
  back - farming.js npcWork: the rows cut, the stubble behind it, nobody paid), a rider out on a horse along the
  country's roads and tracks (traffic.js planRoute / driveToward), a surfer at the nearest break (out at the line-up,
  up on a wave as its crest comes, carving along the face ahead of the break, now and then an air, wiping out in the
  white water, paddling back out - shared/surf.js's waves, the page's surf poses). They go once they're done and
  nobody's looking.
- The view goes with the camera: view.js focusOf / viewRect is the subject while you follow one (round them, leading
  their way, out to the widest shot); cineEyes - traffic.js, npc.js, activities.js, boats.js, wildlife.js fill the
  world round them as round a player, and farming.js / surf.js send the fields and the breaks round them. The page's
  world window follows the camera when it's off you (main.js keepWindow: DIR.eye()). Your character stays where you
  left it.
- The page (client/director.js 'scene' mode, "Follow scenes" in the panel - it starts on the tour): the camera on the
  subject, leading the way they go (0.6 s ahead, at most 380 px), the framing changing every 9-16 s (wider, closer,
  off to one side), an aircraft followed where art v2 draws it up by its height; a cut fades through black while the
  art comes in. N / Enter / A the next one, [ ] / LB RB the kind, T the tour, Q / E / LT RT zoom, Esc / B back.
  Near me / Anywhere in the panel. Like the tour, it tells the server once a minute that it's playing on by itself
  (the idle clock runs slow).
- Not here, because nobody does them on their own: golf, tennis (the club pro only plays you), soccer and volleyball,
  the jetski and raceway races (players').

### Tests
- test/world3scenes.test.js: on World v3 every kind finds someone at it, starts one for the camera or is skipped
  cleanly (the page told either way; the view, the net window and what's sent on them); the street race, chase,
  armored truck, train, plane, combine, horse, surfer, anglers and traffic always found; the hand-off (a racer out:
  the next in the same race; the race over: another scene; the combine done: moved on), the tour's next kind.
- test/director.test.js: the drift goes the way it's pointed at the speed picked (8 ways, the speeds in order, off
  stays put, the zoom), steered by the keys and a stick; the follow camera leads its subject and settles when they
  stop; every kind is the server's and in the tour once.
- On the test's World v3 run from Midtown at noon, 29 of the 36 kinds found someone (or started one); skipped there:
  the gang shootout (no turf near Midtown), the biker clubs, a police patrol, the police helicopter, an ambulance, a
  taxi, a shark - nobody at those just then, and nothing cheap to start.
- Page code: 498.0 KB of the 498 budget (the hooks in main.js: the 'cinef' message, the window following the camera,
  the pad's wheels and bag shut while the camera has the controls); everything else loads with the director.
